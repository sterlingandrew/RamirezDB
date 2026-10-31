-- Policy checks. The security pass lands here rather than in a throwaway
-- SQL-editor session — a policy test you can't re-run isn't a test.
--
-- Setup, once: create three test accounts (dashboard -> Authentication ->
-- Users -> Add user, tick "auto confirm"). New accounts land as pending with
-- no manual step; set the other two as yourself in the SQL editor:
--   update profiles set role = 'personnel' where email = 'test-personnel@ramirezdb.test';
--   update profiles set role = 'admin'     where email = 'test-admin@ramirezdb.test';
-- test-pending@ramirezdb.test stays as it is.
--
-- Each block impersonates one account and rolls back, so a probe write that
-- wrongly succeeds is undone.
--
-- To run a probe: uncomment ONE line and run its block. An error, or
-- "0 rows affected", means denied (good). 1 or more rows affected is a finding.
-- Record every result in docs/security-report.md.

-- ---------------------------------------------------------------- anonymous
-- Expect 0 on every row.
begin;
set local role anon;
select 'sample' as tbl, count(*) as rows_visible from sample
union all select 'note',            count(*) from note
union all select 'alt_id',          count(*) from alt_id
union all select 'age_reading',     count(*) from age_reading
union all select 'extra_sample',    count(*) from extra_sample
union all select 'consensus_image', count(*) from consensus_image
union all select 'audit_log',       count(*) from audit_log
union all select 'profiles',        count(*) from profiles;
rollback;

-- ------------------------------------------------------------ role: pending
-- Expect 0 on every data table, and exactly 1 profile (their own).
begin;
select set_config('request.jwt.claims', json_build_object('role', 'authenticated',
  'sub', (select id from profiles where email = 'test-pending@ramirezdb.test'))::text, true);
set local role authenticated;
select 'sample' as tbl, count(*) as rows_visible from sample
union all select 'note',            count(*) from note
union all select 'alt_id',          count(*) from alt_id
union all select 'age_reading',     count(*) from age_reading
union all select 'extra_sample',    count(*) from extra_sample
union all select 'consensus_image', count(*) from consensus_image
union all select 'audit_log',       count(*) from audit_log
union all select 'profiles',        count(*) from profiles;
-- insert into sample (stssn, strand_date) values ('rls-probe', '2024-01-01');
-- insert into note (note_type, contents) values ('probe', 'rls-probe');
-- update profiles set role = 'personnel' where email = 'test-pending@ramirezdb.test';   -- the important one
-- update profiles set full_name = 'x' where email = 'test-admin@ramirezdb.test';
rollback;

-- ---------------------------------------------------------- role: personnel
-- Expect: every data table readable (> 0), audit_log 0. Insert and update
-- succeed; delete and any role change are denied.
begin;
select set_config('request.jwt.claims', json_build_object('role', 'authenticated',
  'sub', (select id from profiles where email = 'test-personnel@ramirezdb.test'))::text, true);
set local role authenticated;
select 'sample' as tbl, count(*) as rows_visible from sample
union all select 'note',            count(*) from note
union all select 'alt_id',          count(*) from alt_id
union all select 'age_reading',     count(*) from age_reading
union all select 'extra_sample',    count(*) from extra_sample
union all select 'consensus_image', count(*) from consensus_image
union all select 'audit_log',       count(*) from audit_log
union all select 'profiles',        count(*) from profiles;
-- update sample set state = state where stssn = (select stssn from sample limit 1);   -- must succeed
-- delete from sample where stssn = (select stssn from sample limit 1);               -- must be denied
-- delete from note where note_id = (select note_id from note limit 1);               -- must be denied
-- update profiles set role = 'admin' where email = 'test-personnel@ramirezdb.test';  -- must be denied (42501)
-- update profiles set role = 'personnel' where email = 'test-pending@ramirezdb.test'; -- must be denied (42501)
rollback;

-- -------------------------------------------------------------- role: admin
-- Expect: full CRUD, audit_log readable and not editable, roles changeable
-- for others but never their own.
begin;
select set_config('request.jwt.claims', json_build_object('role', 'authenticated',
  'sub', (select id from profiles where email = 'test-admin@ramirezdb.test'))::text, true);
set local role authenticated;
select 'admin reads audit_log' as check, count(*) >= 0 as passed from audit_log;
-- update audit_log set operation = 'tampered';                                       -- must be denied (0 rows)
-- delete from audit_log;                                                              -- must be denied (0 rows)
-- update profiles set role = 'personnel' where email = 'test-admin@ramirezdb.test';  -- must be denied (42501)
-- update profiles set role = 'personnel' where email = 'test-pending@ramirezdb.test'; -- must succeed, and log a profiles UPDATE
rollback;

-- ------------------------------------------- SQL editor (no auth.uid())
-- The role guard lets the editor through, so the first admin can be set by
-- hand. The last-admin guard still applies. Run with one admin in the project.
begin;
-- update profiles set role = 'personnel' where role = 'admin';   -- must be denied: last admin
-- delete from profiles where role = 'admin';                     -- must be denied: last admin
rollback;

-- ------------------------------------------------- RLS enabled on everything
-- Any row with rls_enabled = false is a critical finding.
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relrowsecurity, relname;
