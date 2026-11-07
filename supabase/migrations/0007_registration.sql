-- 0007 — registration: open requests, admin approval.
--
-- Anyone can request access (request-access.html). The sign-up creates an
-- auth user and, through handle_new_user(), a `pending` profile carrying what
-- they told us about themselves. An admin then approves (-> personnel) or
-- rejects (the account is deleted) from the Requests section of admin.html.
--
-- Also folds in the Day 2 security-report findings 1 and 3:
--   1. No security definer function is callable by anon, and the trigger
--      functions are callable by no one through /rest/v1/rpc.
--   3. profiles policies call (select auth.uid()) once, not once per row.

-- ------------------------------------------------- 1. request details
alter table profiles
  add column if not exists affiliation text,
  add column if not exists reason      text;

-- What the requester typed at sign-up. raw_user_meta_data is whatever the
-- client sent, so trim it and cap the length here; nothing else reads it.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, affiliation, reason)
  values (
    new.id,
    new.email,
    left(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 200),
    left(nullif(btrim(new.raw_user_meta_data ->> 'affiliation'), ''), 200),
    left(nullif(btrim(new.raw_user_meta_data ->> 'reason'), ''), 2000)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ------------------------------------------------- 2. approve and reject
-- Both run as the calling admin: auth.uid() survives security definer, so
-- profiles_role_guard and profiles_role_audit still see who did it.

-- Approve: pending -> personnel. A plain role update, so the role trigger
-- logs it like any other role change.
create or replace function approve_request(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only an admin can approve requests.' using errcode = '42501';
  end if;

  update profiles set role = 'personnel'
   where id = target and role = 'pending';

  if not found then
    raise exception 'That request is no longer pending.' using errcode = 'P0002';
  end if;
end;
$$;

-- Reject: delete the auth user; the profile goes with it by cascade. Only
-- pending accounts can be rejected, so this can never remove a member (and
-- a pending account has no readings, so age_reading's FK can't block it).
-- The cascade isn't audited by any trigger, so the request is logged here.
create or replace function reject_request(target uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  req profiles;
begin
  if not is_admin() then
    raise exception 'Only an admin can reject requests.' using errcode = '42501';
  end if;

  select * into req from profiles
   where id = target and role = 'pending'
     for update;

  if not found then
    raise exception 'That request is no longer pending.' using errcode = 'P0002';
  end if;

  insert into audit_log (modified_at, operation, old_value, new_value,
                         related_stssn, modified_by)
  values (now(), 'profiles REJECT', to_jsonb(req)::text, '', null, auth.uid());

  delete from auth.users where id = target;
end;
$$;

-- The Requests list. handle_new_user() fires when the auth user is created,
-- before the email is confirmed, so a pending profile alone doesn't mean a
-- real request. Confirmation lives in auth.users, which the client can't read;
-- this returns it for admins only. Empty for everyone else.
create or replace function list_requests()
returns table (id uuid, full_name text, email text, affiliation text,
               reason text, created_at timestamptz, confirmed_at timestamptz)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id, p.full_name, p.email, p.affiliation, p.reason, p.created_at,
         u.email_confirmed_at
    from profiles p
    join auth.users u on u.id = p.id
   where p.role = 'pending' and is_admin()
   order by p.created_at;
$$;

-- ------------------------------------------------- 3. execute grants (finding 1)
-- Postgres grants execute to PUBLIC by default, so revoke from PUBLIC too.

-- Trigger functions: fired by the database, never called directly.
revoke execute on function handle_new_user()        from public, anon, authenticated;
revoke execute on function log_sample_change()      from public, anon, authenticated;
revoke execute on function log_row_change()         from public, anon, authenticated;
revoke execute on function guard_role_change()      from public, anon, authenticated;
revoke execute on function guard_last_admin_delete() from public, anon, authenticated;
revoke execute on function rls_auto_enable()        from public, anon, authenticated;

-- Helpers used by the policies, all of which are `to authenticated`.
revoke execute on function auth_role()  from public, anon;
revoke execute on function is_admin()   from public, anon;
revoke execute on function is_member()  from public, anon;
revoke execute on function can_write()  from public, anon;
grant  execute on function auth_role()  to authenticated;
grant  execute on function is_admin()   to authenticated;
grant  execute on function is_member()  to authenticated;
grant  execute on function can_write()  to authenticated;

-- The new rpcs check is_admin() themselves; anon has no business calling them.
revoke execute on function approve_request(uuid) from public, anon;
revoke execute on function reject_request(uuid)  from public, anon;
grant  execute on function approve_request(uuid) to authenticated;
grant  execute on function reject_request(uuid)  to authenticated;
revoke execute on function list_requests()       from public, anon;
grant  execute on function list_requests()       to authenticated;

-- ------------------------------------------------- 4. profiles policies (finding 3)
-- Same rules as 0006 / the live project, with auth.uid() evaluated once.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select to authenticated
  using (is_member() or id = (select auth.uid()));

-- The live name is profiles_update_self; 0002 called it
-- profiles_update_self_not_role. Drop either.
drop policy if exists profiles_update_self on profiles;
drop policy if exists profiles_update_self_not_role on profiles;
create policy profiles_update_self on profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid())
              and role = (select p.role from profiles p where p.id = (select auth.uid())));
