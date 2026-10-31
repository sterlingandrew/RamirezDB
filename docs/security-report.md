# Security report

Filled in during Sprint 5. Stubbed now so the pass has somewhere to land.

Method: with only the public publishable key, and then as each role, attempt every
operation the role should not be able to perform. Queries in
`supabase/tests/policies.sql`.

## Coverage

| Check | Result | Date |
| --- | --- | --- |
| RLS enabled on every table, view and function | Pass: RLS on for all 8 public tables | 2026-10-31 |
| Publishable key alone returns zero rows from every table | Pass: `anon` has no select or insert grant on any table (42501 before RLS runs) | 2026-10-31 |
| `pending` sees zero rows from every data table, and only its own profile | Pass: test-pending sees 0 on all 7 tables and 1 profile | 2026-10-31 |
| `pending` cannot insert, update or delete any data table | Pass: insert into sample and note gives 42501, update and delete affect 0 rows | 2026-10-31 |
| No one can change their own role, admins and SQL-editor impersonation included | Pass: pending and personnel get 42501 "Only an admin can change roles.", admin gets 42501 "You cannot change your own role." | 2026-10-31 |
| The last admin cannot be demoted or deleted | Pass: from the SQL editor, demote and delete both give 42501 | 2026-10-31 |
| Only an admin can change another member's role | Pass: personnel changing test-pending affects 0 rows, admin changing it affects 1 | 2026-10-31 |
| `pending` and `personnel` cannot edit another member's profile | Pass: renaming test-admin affects 0 rows for both | 2026-10-31 |
| `personnel` cannot delete | Pass: delete from sample and note affects 0 rows. Update affects 1 | 2026-10-31 |
| Nobody can update or delete `audit_log` | Pass: update and delete affect 0 rows for personnel and admin | 2026-10-31 |
| Role changes and note / alt_id / consensus_image writes appear in `audit_log` | Pass: each write logs e.g. `note UPDATE` with the sample key and the writer's id. Role changes log `profiles UPDATE`, including the two from setting the test roles | 2026-10-31 |
| Storage bucket policies reviewed (separate system from table RLS) | N/A: no buckets, objects or storage policies. Recheck if images move to Storage | 2026-10-31 |
| Same results through the REST API with real sign-ins (publishable key + password) | Pass: pending 0 samples / 1 profile, personnel 1234 / 4 / audit 0, admin 1234 / 4 / audit 2682, anon 401 | 2026-10-31 |
| Dashboard security advisor clear | Fail: findings 1–2 | 2026-10-31 |
| Dashboard performance advisor clear | Fail: finding 3. Unused-index notices are expected at this data size | 2026-10-31 |
| Leaked-password protection and minimum length on | Fail: finding 2 | 2026-10-31 |
| Allowed origins restricted to the Pages domain | | |

## Findings

| # | Severity | Finding | Fix | Retested |
| --- | --- | --- | --- | --- |
| 1 | Low | All 10 `security definer` functions in `public` can be called by `anon` and `authenticated` through `/rest/v1/rpc`. The trigger functions refuse a direct call, and `is_admin` / `is_member` / `can_write` / `auth_role` only describe the caller | `revoke execute ... from anon, authenticated` on the trigger functions and `rls_auto_enable`, and revoke the helpers from `anon`, in the next migration | |
| 2 | Medium | Leaked-password protection is off. That matters more now that registration is open | Dashboard → Authentication → Providers → Email: enable leaked-password protection and set a minimum length | |
| 3 | Low | `profiles_select` and `profiles_update_self` call `auth.uid()` once per row, and profiles has two permissive UPDATE policies | Wrap the call as `(select auth.uid())`. Negligible at lab scale | |
