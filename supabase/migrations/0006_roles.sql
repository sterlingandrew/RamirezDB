-- 0006 — roles: pending / personnel / admin.
--
-- Applies the lab's Oct 10 decisions (docs/roles.md):
--   * There is no read-only member role. `user` becomes `pending`: an account
--     that has asked for access and sees no data until an admin approves it.
--   * Only personnel and admin read the data tables. This supersedes the
--     `using (true)` select policies in 0003 and closes its OPEN question.
--   * Role changes are enforced by the database, not by a disabled <select>:
--     only an admin may change a role, never their own, and the last admin
--     cannot be demoted or deleted.
--   * Role changes and writes to note, alt_id and consensus_image are audited.
--
-- Insert, update and delete policies are unchanged: can_write() is already
-- "personnel or admin", and delete is already is_admin().

-- ------------------------------------------------------------ 1. the rename
-- Renaming keeps the value's identity, so every existing `user` row and the
-- column default become `pending` in one statement. Unlike `add value`, this
-- is safe inside the same transaction as the rest of the file.
--
-- The live project was renamed by hand before this file existed, so the rename
-- is conditional: a no-op there, and the real change on a fresh rebuild.
do $$
begin
  if exists (select 1 from pg_enum
             where enumtypid = 'app_role'::regtype and enumlabel = 'user') then
    alter type app_role rename value 'user' to 'pending';
  end if;
end $$;

-- ------------------------------------------------------------ 2. is_member()
create or replace function is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role in ('personnel', 'admin') from profiles where id = auth.uid()), false);
$$;

-- ------------------------------------------------- 3. data table select
do $$
declare t text;
begin
  foreach t in array array['sample', 'note', 'alt_id', 'age_reading',
                           'extra_sample', 'consensus_image']
  loop
    execute format('drop policy %I on %I', t || '_select', t);
    execute format('create policy %I on %I for select to authenticated using (is_member())',
                   t || '_select', t);
  end loop;
end $$;

-- ----------------------------------------------------- 4. profiles select
-- A pending account can still read its own row: currentProfile() needs it to
-- route them to pending.html. The live project named this policy
-- profiles_select rather than 0002's profiles_select_authenticated, so drop
-- either.
drop policy if exists profiles_select_authenticated on profiles;
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select to authenticated using (is_member() or id = auth.uid());

-- ------------------------------------------- 5–6. role and last-admin guards
-- Raises 42501 unless the caller is an admin changing someone else's role.
-- Skipped when auth.uid() is null — the SQL editor or the secret key — so the
-- first admin can be set, and access recovered, by hand. Impersonating a user
-- in the SQL editor sets auth.uid(), so the guard still applies there.
--
-- The last-admin check runs for everyone, the SQL editor included. Locking the
-- admin rows first means two admins demoting each other at the same moment
-- can't both succeed.
create or replace function guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  if auth.uid() is not null then
    if not is_admin() then
      raise exception 'Only an admin can change roles.' using errcode = '42501';
    end if;
    if new.id = auth.uid() then
      raise exception 'You cannot change your own role.' using errcode = '42501';
    end if;
  end if;

  if old.role = 'admin' then
    perform 1 from profiles where role = 'admin' for update;
    if not exists (select 1 from profiles where role = 'admin' and id <> old.id) then
      raise exception 'The last admin cannot be demoted.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_role_guard
  before update of role on profiles
  for each row execute function guard_role_change();

-- Covers deleting the auth user too: the cascade into profiles fires this.
create or replace function guard_last_admin_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'admin' then
    perform 1 from profiles where role = 'admin' for update;
    if not exists (select 1 from profiles where role = 'admin' and id <> old.id) then
      raise exception 'The last admin cannot be deleted.' using errcode = '42501';
    end if;
  end if;
  return old;
end;
$$;

create trigger profiles_last_admin_delete
  before delete on profiles
  for each row execute function guard_last_admin_delete();

-- ------------------------------------------------------------------ 7. audit
-- 0004's log_sample_change() reads new.stssn, which note (for_sample) and
-- consensus_image (of_stssn) don't have. This version takes the key column as
-- a trigger argument, and records the operation as e.g. 'note INSERT' so the
-- admin page can tell tables apart. With no argument, related_stssn is null
-- (profiles: the id is in old_value/new_value).
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
                         related_stssn, modified_by)
  values (
    now(),
    tg_table_name || ' ' || tg_op,
    coalesce(to_jsonb(old)::text, ''),
    coalesce(to_jsonb(new)::text, ''),
    row_key,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

create trigger note_audit
  after insert or update or delete on note
  for each row execute function log_row_change('for_sample');

create trigger alt_id_audit
  after insert or update or delete on alt_id
  for each row execute function log_row_change('stssn');

create trigger consensus_image_audit
  after insert or update or delete on consensus_image
  for each row execute function log_row_change('of_stssn');

create trigger profiles_role_audit
  after update of role on profiles
  for each row
  when (old.role is distinct from new.role)
  execute function log_row_change();
