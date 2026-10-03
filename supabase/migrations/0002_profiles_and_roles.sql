-- 0002 — identity and roles.
--
-- Supabase Auth owns identity. This table carries everything about a person
-- that the app needs and auth.users doesn't hold.
--
-- The one rule this file exists to enforce: a member cannot change their own
-- role. That was a real defect in the PHP version (self-selected at
-- registration) and it is designed out here rather than validated away.

create type app_role as enum ('user', 'personnel', 'admin');

create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  role       app_role not null default 'user',
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Role lookup used by every other policy. security definer so it can read
-- profiles without recursing through profiles' own policies; search_path is
-- pinned because a definer function with a mutable search_path is exploitable.
create or replace function auth_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
$$;

create or replace function can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role in ('personnel', 'admin') from profiles where id = auth.uid()), false);
$$;

-- Everyone signed in can see who's in the lab.
create policy profiles_select_authenticated on profiles
  for select to authenticated using (true);

-- You may edit your own name. You may NOT change your own role: the with check
-- re-reads the stored role and requires it to be unchanged.
create policy profiles_update_self_not_role on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from profiles p where p.id = auth.uid()));

create policy profiles_update_admin on profiles
  for update to authenticated using (is_admin()) with check (is_admin());

create policy profiles_insert_admin on profiles
  for insert to authenticated with check (is_admin());

create policy profiles_delete_admin on profiles
  for delete to authenticated using (is_admin());

-- New accounts get a profile automatically, at the lowest role. An admin
-- promotes from there.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Point the legacy user-id columns at profiles.
alter table sample      add constraint sample_entered_by_fkey  foreign key (entered_by)  references profiles (id) on delete set null;
alter table note        add constraint note_left_by_fkey       foreign key (left_by)     references profiles (id) on delete set null;
alter table audit_log   add constraint audit_log_modified_by_fkey foreign key (modified_by) references profiles (id) on delete set null;
alter table age_reading add constraint age_reading_user_id_fkey foreign key (user_id)    references profiles (id);

-- First admin: after pushing, create your own account (dashboard ->
-- Authentication -> Users -> Add user), then run in the SQL editor:
--   update profiles set role = 'admin' where email = '<your email>';
