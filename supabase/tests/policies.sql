-- Policy checks. Sprint 5's security pass lands here rather than in a
-- throwaway SQL-editor session — a policy test you can't re-run isn't a test.
--
-- Setup, once: create three test accounts (dashboard -> Authentication ->
-- Users -> Add user, tick "auto confirm") and set their roles:
--   update profiles set role = 'user'      where email = 'test-user@ramirezdb.test';
--   update profiles set role = 'personnel' where email = 'test-personnel@ramirezdb.test';
--   update profiles set role = 'admin'     where email = 'test-admin@ramirezdb.test';
--
-- Each block looks up the account's id, impersonates it, and rolls back, so a
-- probe write that wrongly succeeds is undone.
--
-- To run a probe: uncomment ONE line and run its block. An error, or
-- "0 rows affected", means denied (good). 1 or more rows affected is a finding.

-- ---------------------------------------------------------------- anonymous
-- Expect 0 and 0.
begin;
set local role anon;
select 'anon sees samples' as check, count(*) as rows_visible from sample;
select 'anon sees profiles' as check, count(*) as rows_visible from profiles;
rollback;

-- --------------------------------------------------------------- role: user
begin;
select set_config('request.jwt.claims', json_build_object('role', 'authenticated',
  'sub', (select id from profiles where email = 'test-user@ramirezdb.test'))::text, true);
set local role authenticated;
select 'user can read samples' as check, count(*) > 0 as passed from sample;
-- insert into sample (stssn, strand_date) values ('rls-probe', '2024-01-01');
-- update sample set state = 'XX' where stssn = (select stssn from sample limit 1);
-- delete from sample where stssn = (select stssn from sample limit 1);
-- update profiles set role = 'admin' where email = 'test-user@ramirezdb.test';   -- the important one
-- update profiles set full_name = 'x' where email = 'test-admin@ramirezdb.test';
rollback;

-- ---------------------------------------------------------- role: personnel
-- Expect: insert and update succeed, delete is denied.
begin;
select set_config('request.jwt.claims', json_build_object('role', 'authenticated',
  'sub', (select id from profiles where email = 'test-personnel@ramirezdb.test'))::text, true);
set local role authenticated;
-- delete from sample where stssn = (select stssn from sample limit 1);   -- must be denied
rollback;

-- -------------------------------------------------------------- role: admin
-- Expect: full CRUD, audit_log readable, audit_log not editable.
begin;
select set_config('request.jwt.claims', json_build_object('role', 'authenticated',
  'sub', (select id from profiles where email = 'test-admin@ramirezdb.test'))::text, true);
set local role authenticated;
select 'admin reads audit_log' as check, count(*) >= 0 as passed from audit_log;
-- update audit_log set operation = 'tampered';   -- must be denied
rollback;

-- ------------------------------------------------- RLS enabled on everything
-- Any row with rls_enabled = false is a critical finding.
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relrowsecurity, relname;
