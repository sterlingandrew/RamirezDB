-- 0009 — consensus images in Supabase Storage.
--
-- Images are lab data and only members may see them. A Dropbox share link
-- is public to anyone who has it, so the site never shows one: every image
-- is copied into a private bucket, and the pages download it with the
-- viewer's own session (no signed or shareable URL is ever made).
--
--   raw_image    the file's path in the bucket, e.g.
--                `AB20240612-01/1732200000000-mosaic.jpg`
--   source_link  the Dropbox link it was copied from (the lab's record that
--                the image exists: no link, no image). Members only, like
--                every column.
--
-- The 81 rows from MySQL still hold Dropbox links in raw_image. The admin
-- page copies them into the bucket; the check below holds every new or
-- changed row to a bucket path, and is validated once those are copied.
--
-- Storage has its own access rules: policies on storage.objects, separate
-- from the table policies in 0003/0006. A private bucket with no policies
-- refuses everything, so each permission below is opened on purpose, and they
-- mirror docs/roles.md:
--   read    -> members (personnel, admin)
--   upload  -> personnel, admin
--   delete  -> admin
--   update  -> nobody. An upload never overwrites: paths carry a timestamp
--              and the page uploads with upsert off. A replaced image is a
--              new row plus an admin delete, both of which are audited.
--

alter table consensus_image add column source_link varchar(2083);

alter table consensus_image add constraint consensus_image_in_bucket
  check (raw_image !~* '^[a-z][a-z0-9+.-]*://') not valid;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consensus-images', 'consensus-images', false, 52428800,  -- 50 MB
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy consensus_images_select on storage.objects
  for select to authenticated
  using (bucket_id = 'consensus-images' and (select is_member()));

create policy consensus_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'consensus-images' and (select can_write()));

create policy consensus_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'consensus-images' and (select is_admin()));

-- ------------------------------------------------ who entered a sample
-- import_samples() sets entered_by to the caller; the New sample form didn't.
-- A default makes every insert record the signed-in user without the browser
-- sending it. NULL from the SQL editor, as for the 1234 legacy rows.
alter table sample alter column entered_by set default auth.uid();

-- ------------------------------------------- image links in the CSV import
-- The template gains two columns, image.folder and consensus.image (the
-- Dropbox folder and file links, as the MySQL data had them). If there's no
-- link, the lab has no image, so this is how images enter in bulk.
--
-- import_samples() (0008) is replaced with the same signature, so its grants
-- stand. Changes:
--   * raw_image (a Dropbox file link) and image_folder are accepted keys.
--     They are taken out of the sample row and written to consensus_image,
--     inside the row's savepoint, so a bad link fails only its own row.
--   * The row gets source_link = the Dropbox link and raw_image = a new path
--     in the bucket, `<STSSN>/<batch>-<file name>`. The result lists them in
--     `copies`, and import.html copies each file there right after the
--     commit. A file that fails to copy shows a "Copy into secure storage"
--     button on its sample page.
--   * A link already on the same sample is skipped. A link on another sample
--     is an error naming that sample.
--   * The result gains `images`, the number of links added, and the batch
--     note mentions them. The consensus_image audit rows carry the batch id.

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
    'processed_bone', 'rings_consensus', 'annulus_consensus', 'humerus_diameter',
    'image_folder', 'raw_image'];

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
  img_link   text;
  img_folder text;
  img_owner  text;
  img_path   text;
  copies     jsonb := '[]'::jsonb;
  images     integer := 0;
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

      -- The image link goes to consensus_image, not sample.
      img_link   := clean ->> 'raw_image';
      img_folder := clean ->> 'image_folder';
      clean := clean - 'raw_image' - 'image_folder';

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
        else
          rec := jsonb_populate_record(null::sample, clean);
          rec.species    := coalesce(rec.species, 'u');
          rec.sex        := coalesce(rec.sex, 'u');
          rec.entered_by := auth.uid();
          insert into sample values (rec.*);
        end if;

        -- One consensus image per row. The same link on the same sample is
        -- already there and is skipped; on another sample it is an error,
        -- because a link belongs to exactly one turtle. Dropbox links to one
        -- file differ only after the "?" (dl=, raw=, st=), so those compare
        -- on the part before it.
        if img_link is not null then
          img_owner := null;
          select of_stssn into img_owner from consensus_image
           where coalesce(source_link, raw_image) = img_link
              or (img_link ~* '^https://(www\.)?dropbox\.com/'
                  and lower(split_part(coalesce(source_link, raw_image), '?', 1))
                      = lower(split_part(img_link, '?', 1)))
           order by (of_stssn = id) desc
           limit 1;
          if img_owner is null then
            img_path := regexp_replace(id, '[^A-Za-z0-9._-]+', '_', 'g') || '/' || batch || '-'
                        || regexp_replace(
                             coalesce(nullif(regexp_replace(img_link, '^https?://[^?]*/([^/?]+)(\?.*)?$', '\1'), img_link), 'image.jpg'),
                             '[^A-Za-z0-9._-]+', '_', 'g');
            insert into consensus_image (image_folder, raw_image, source_link, of_stssn)
            values (coalesce(img_folder, ''), img_path, img_link, id);
            copies := copies || jsonb_build_object('row', line, 'stssn', id, 'path', img_path, 'link', img_link);
          elsif img_owner <> id then
            raise exception 'This image link is already on sample %.', img_owner
              using errcode = '23505', column = 'raw_image';
          end if;
        end if;

        -- Counted only once the whole row, image included, has gone in.
        if existing then updated := updated + 1; else added := added + 1; end if;
        if img_link is not null and img_owner is null then images := images + 1; end if;
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
            when 'consensus_image_raw_image_key' then 'raw_image'
          end);
        if err_state = '23514' and err_con = 'sample_species_check' then
          err_msg := 'Species must be one of cc, cm, dc, ei, lk, u.';
        elsif err_state = '23514' and err_con = 'sample_sex_check' then
          err_msg := 'Sex must be f, m or u.';
        elsif err_state = '23505' and err_con = 'sample_pkey' then
          err_msg := 'A sample with this STSSN already exists.';
        elsif err_state = '23505' and err_con = 'consensus_image_raw_image_key' then
          err_msg := 'This image link is already on another sample.';
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
                  || case when images > 0 then format(' %s image links added.', images) else '' end
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
    'images',    images,
    'copies',    case when committed then copies else '[]'::jsonb end,
    'total',     jsonb_array_length(rows),
    'errors',    errors);
end;
$$;

revoke execute on function import_samples(jsonb, boolean, boolean, text) from public, anon;
grant  execute on function import_samples(jsonb, boolean, boolean, text) to authenticated;
