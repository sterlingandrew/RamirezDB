-- 0008 — CSV import of samples.
--
-- import.html parses and checks a spreadsheet in the browser, then hands the
-- rows to import_samples(). This file is the part that can't be skipped:
--
--   * security invoker. The function runs as the caller, so the ordinary
--     insert/update policies from 0003 decide who may import. A pending
--     account fails on its first insert, dry run included.
--   * All or nothing. Every row is tried; if any row fails, or this is a dry
--     run, everything is rolled back and the per-row errors are returned.
--   * One batch note per import. Its note_id is written into
--     audit_log.change_note for every row the import touches, so a bad import
--     can be found, and removed, as a unit (docs/import.md).
--   * An STSSN that already exists is an error unless update_existing is true.
--     That is a separate, explicit checkbox on the page.

-- ------------------------------------------------- 1. audit carries the batch
-- import_samples() puts the batch note id in a transaction-local setting.
-- Both audit triggers copy it into change_note. Outside an import the setting
-- is unset and change_note stays null, exactly as before.
--
-- The setting can't be forged from the browser: PostgREST exposes only
-- functions in `public`, and set_config is in pg_catalog.

create or replace function import_batch_id()
returns integer
language sql
stable
set search_path = public
as $$
  select nullif(current_setting('ramirezdb.import_batch', true), '')::integer;
$$;

create or replace function log_sample_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (modified_at, operation, old_value, new_value,
                         related_stssn, modified_by, change_note)
  values (
    now(),
    tg_op,
    coalesce(to_jsonb(old)::text, ''),
    coalesce(to_jsonb(new)::text, ''),
    coalesce(new.stssn, old.stssn),
    auth.uid(),
    import_batch_id()
  );
  return coalesce(new, old);
end;
$$;

create or replace function log_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_key text;
begin
  if tg_nargs > 0 then
    row_key := coalesce(to_jsonb(new) ->> tg_argv[0], to_jsonb(old) ->> tg_argv[0]);
  end if;

  insert into audit_log (modified_at, operation, old_value, new_value,
                         related_stssn, modified_by, change_note)
  values (
    now(),
    tg_table_name || ' ' || tg_op,
    coalesce(to_jsonb(old)::text, ''),
    coalesce(to_jsonb(new)::text, ''),
    row_key,
    auth.uid(),
    import_batch_id()
  );
  return coalesce(new, old);
end;
$$;

-- ------------------------------------------------- 2. import_samples
-- rows: a JSON array of objects keyed by sample column names, each with an
-- optional "_row" (the spreadsheet row number, used only in error messages).
-- entered_by is never taken from the file; it is the caller.
--
-- Inserts: missing species and sex become 'u', as in the table defaults.
-- Updates (update_existing): only the keys present with a non-null value are
-- changed. A blank cell leaves the stored value alone; it never erases it.
--
-- Returns
--   { ok, dry_run, committed, batch, added, updated, total,
--     errors: [{ row, stssn, column, message, code }] }
-- committed is true only when the rows were written. batch is the note_id of
-- the batch note when committed, else null.

create or replace function import_samples(
  rows            jsonb,
  dry_run         boolean default true,
  update_existing boolean default false,
  file_name       text    default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  max_rows constant integer := 1000;
  allowed  constant text[] := array[
    'stssn', 'species', 'gamm_id', 'strand_date', 'strand_scl', 'strand_ccl',
    'strand_scw', 'sex', 'state', 'decomposition', 'collaborator',
    'processed_bone', 'rings_consensus', 'annulus_consensus', 'humerus_diameter'];

  r          jsonb;
  clean      jsonb;
  idx        integer := 0;
  line       integer;
  k          text;
  id         text;
  seen       text[] := '{}';
  existing   boolean;
  row_ok     boolean;
  set_cols   text[];
  rec        sample;
  errors     jsonb := '[]'::jsonb;
  added      integer := 0;
  updated    integer := 0;
  batch      integer;
  committed  boolean := false;
  err_col    text;
  err_con    text;
  err_state  text;
  err_msg    text;
begin
  if rows is null or jsonb_typeof(rows) <> 'array' then
    raise exception 'rows must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(rows) = 0 then
    raise exception 'There are no rows to import.' using errcode = '22023';
  end if;
  if jsonb_array_length(rows) > max_rows then
    raise exception 'At most % rows per import. Split the file into smaller batches.', max_rows
      using errcode = '22023';
  end if;

  -- Everything below runs in one subtransaction, so it can be undone as a
  -- whole while the variables (the report) survive.
  begin
    -- The batch note comes first. For a pending account this insert is where
    -- RLS says no (42501), before any sample is touched.
    insert into note (note_type, contents, date, left_by)
    values ('Import batch',
            format('CSV import of %s rows%s.', jsonb_array_length(rows),
                   coalesce(' from ' || left(file_name, 200), '')),
            now(), auth.uid())
    returning note_id into batch;

    perform set_config('ramirezdb.import_batch', batch::text, true);

    for r in select value from jsonb_array_elements(rows) loop
      idx := idx + 1;
      line := case when jsonb_typeof(r -> '_row') = 'number'
                   then (r ->> '_row')::numeric::integer else idx end;
      id := null;

      if jsonb_typeof(r) <> 'object' then
        errors := errors || jsonb_build_object('row', line, 'message', 'Not an object.');
        continue;
      end if;

      -- Unknown keys are a client bug or a renamed column. Say so.
      row_ok := true;
      for k in select jsonb_object_keys(r) loop
        if k <> '_row' and not k = any(allowed) then
          errors := errors || jsonb_build_object('row', line, 'column', k,
                                                 'message', 'Unknown column.');
          row_ok := false;
        end if;
      end loop;

      id := nullif(btrim(r ->> 'stssn'), '');
      if id is null then
        errors := errors || jsonb_build_object('row', line, 'column', 'stssn',
                                               'message', 'STSSN is required.');
        continue;
      end if;
      if id = any(seen) then
        errors := errors || jsonb_build_object('row', line, 'stssn', id, 'column', 'stssn',
                                               'message', 'This STSSN appears more than once in the file.');
        continue;
      end if;
      seen := seen || id;
      if not row_ok then continue; end if;

      -- Normalise: trim text, blank -> null, species and sex lowercased to
      -- match 0005, state uppercased.
      select coalesce(jsonb_object_agg(key,
               case
                 when jsonb_typeof(value) = 'string' and btrim(value #>> '{}') = '' then 'null'::jsonb
                 when key in ('species', 'sex') and jsonb_typeof(value) = 'string'
                   then to_jsonb(lower(btrim(value #>> '{}')))
                 when key = 'state' and jsonb_typeof(value) = 'string'
                   then to_jsonb(upper(btrim(value #>> '{}')))
                 when jsonb_typeof(value) = 'string' then to_jsonb(btrim(value #>> '{}'))
                 else value
               end), '{}'::jsonb)
        into clean
        from jsonb_each(r)
       where key <> '_row';
      clean := clean || jsonb_build_object('stssn', id);

      existing := exists (select 1 from sample where stssn = id);
      if existing and not update_existing then
        errors := errors || jsonb_build_object('row', line, 'stssn', id, 'column', 'stssn',
          'message', 'A sample with this STSSN already exists. Tick "Update existing samples" to overwrite it.');
        continue;
      end if;

      -- One savepoint per row: a failing row rolls back only itself, so every
      -- row gets checked and reported.
      begin
        if existing then
          select array_agg(key) into set_cols
            from jsonb_each(clean)
           where key <> 'stssn' and jsonb_typeof(value) <> 'null';

          if set_cols is not null then
            -- Column names come from `allowed` above, and %I quotes them.
            execute format(
              'update sample s set (%s) = (select %s from jsonb_populate_record(null::sample, $1) x) where s.stssn = $2',
              (select string_agg(format('%I', c), ', ') from unnest(set_cols) c),
              (select string_agg(format('x.%I', c), ', ') from unnest(set_cols) c))
            using clean, id;
            if not found then
              raise exception 'You do not have permission to update this sample.'
                using errcode = '42501';
            end if;
          end if;
          updated := updated + 1;
        else
          rec := jsonb_populate_record(null::sample, clean);
          rec.species    := coalesce(rec.species, 'u');
          rec.sex        := coalesce(rec.sex, 'u');
          rec.entered_by := auth.uid();
          insert into sample values (rec.*);
          added := added + 1;
        end if;
      exception when others then
        get stacked diagnostics err_state = returned_sqlstate,
                                err_msg   = message_text,
                                err_col   = column_name,
                                err_con   = constraint_name;
        err_col := coalesce(nullif(err_col, ''),
          case err_con
            when 'sample_species_check' then 'species'
            when 'sample_sex_check'     then 'sex'
            when 'sample_pkey'          then 'stssn'
          end);
        if err_state = '23514' and err_con = 'sample_species_check' then
          err_msg := 'Species must be one of cc, cm, dc, ei, lk, u.';
        elsif err_state = '23514' and err_con = 'sample_sex_check' then
          err_msg := 'Sex must be f, m or u.';
        elsif err_state = '23505' then
          err_msg := 'A sample with this STSSN already exists.';
        end if;
        errors := errors || jsonb_strip_nulls(jsonb_build_object(
          'row', line, 'stssn', id, 'column', err_col,
          'message', err_msg, 'code', err_state));
      end;
    end loop;

    if dry_run or jsonb_array_length(errors) > 0 then
      raise exception 'rollback' using errcode = 'RZ001';
    end if;

    update note
       set contents = format('CSV import%s: %s added, %s updated.',
                             coalesce(' of ' || left(file_name, 200), ''), added, updated)
     where note_id = batch;

    perform set_config('ramirezdb.import_batch', '', true);
    committed := true;
  exception
    when sqlstate 'RZ001' then
      -- Rolled back on purpose: dry run, or at least one row failed.
      committed := false;
  end;

  return jsonb_build_object(
    'ok',        jsonb_array_length(errors) = 0,
    'dry_run',   dry_run,
    'committed', committed,
    'batch',     case when committed then batch end,
    'added',     added,
    'updated',   updated,
    'total',     jsonb_array_length(rows),
    'errors',    errors);
end;
$$;

-- ------------------------------------------------- 3. execute grants
-- Same rule as 0007: nothing for anon. import_batch_id() is only for the
-- triggers; it reveals nothing, but there's no reason to expose it.
revoke execute on function import_batch_id() from public, anon, authenticated;
revoke execute on function import_samples(jsonb, boolean, boolean, text) from public, anon;
grant  execute on function import_samples(jsonb, boolean, boolean, text) to authenticated;
