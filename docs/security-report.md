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

## Registration (0007, Day 3)

| Check | Result | Date |
| --- | --- | --- |
| A sign-up creates a `pending` profile with name, affiliation and reason copied from metadata (trimmed, blanks become null) | Pass (SQL, rolled back) | 2026-11-07 |
| pending and anon cannot call `approve_request` / `reject_request` | Pass: 42501 | 2026-11-07 |
| Admin approve: pending → personnel, logged as `profiles UPDATE` by the admin | Pass | 2026-11-07 |
| Admin reject deletes the auth user and profile, logged as `profiles REJECT` | Pass | 2026-11-07 |
| Reject refuses a personnel or admin target, including yourself | Pass: P0002 "That request is no longer pending." | 2026-11-07 |
| `list_requests` returns rows only for admins, with confirmation status | Pass: admin sees 2 (1 confirmed), pending sees 0 | 2026-11-07 |
| End-to-end on the live site with a team-member address (request, confirm, pending page, approve, sign in; reject a second) | Pass: audit_log shows `profiles UPDATE` (approve) at 21:03 UTC and `profiles REJECT` at 21:04 UTC. The password hint listed only the missing rules | 2026-11-07 |
| End-to-end with a real outside email | Deferred to handoff: Supabase's built-in sender only delivers to team members, so this waits for custom SMTP | |

## CSV import (0008, Day 4)

| Check | Result | Date |
| --- | --- | --- |
| `import_samples` is `security invoker`; anon cannot execute it; `import_batch_id` is executable by no API role | Pass: `has_function_privilege` false for anon (both) and authenticated (`import_batch_id`) | 2026-11-14 |
| A non-member cannot import, dry run included | Pass (SQL, impersonating a uuid with no profile): 42501 RLS on the batch note insert, before any sample is touched | 2026-11-14 |
| All-or-nothing: one bad row rolls back the whole import and every bad row is reported | Pass: 10-row mixed file returned 9 errors (existing STSSN, in-file duplicate, bad species, bad sex, non-number, unknown column, blank STSSN, too long, Feb 30), `committed: false` | 2026-11-14 |
| Every row of a committed import, and the batch note update, carry the batch id in `audit_log.change_note` | Pass (rolled back): 2 `INSERT` rows on batch 447, `UPDATE` on batch 448 | 2026-11-14 |
| Existing STSSN rejected unless `update_existing`; an update with a blank cell leaves the stored value | Pass | 2026-11-14 |
| 1000-row dry run within the API statement timeout | Pass: about 0.5 s | 2026-11-14 |
| Import page end to end (local server, signed in as admin) with the test files | Pass: `1-clean.csv` shows 6 rows, 4 automatic fixes in green (underscore and two-digit year, spaces/case/two-digit year, two dates filled from the STSSN), the `*` exception kept as written, 1 warning (`FL(FG)` → FL); confirmed on the page. Same payload through `import_samples` as a dry run (SQL, as admin): 6 would be added. `2-existing.csv`: the SQL dry run rejects the existing STSSN on row 4. `3-errors.csv`: 15 errors from the browser rules (Node). The 2-existing and 3-errors files were not yet run on the page | 2026-11-14 |
| STSSN auto-fixes (port of the lab's IDdaterV2.py) never corrupt a well-formed ID | Pass (Node): matches the script on legacy IDs; unlike it, leaves `ABC20240612-01` unchanged (the script gives `ABC2020240612-01`), won't glue `… RIGHT` onto the ID, and won't expand an impossible date (month 13) | 2026-11-14 |
| A pending account on the live site cannot import (redirected from import.html; rpc refused) | Pass: signed in as a pending account, import.html redirects to the pending page and there is no Import link. The rpc refusal is covered by the SQL check above (42501) | 2026-11-14 |
| Lab's real sheet dry-runs clean, or with every problem listed | Pass (browser rules, run in Node; not yet on the page): LK_Inventory (Kemp's ridley, 806 rows) exported as CSV UTF-8. Without a species column the file is refused; with one, every problem is listed with its row: 147 errors (130 network IDs in stssn.id, 11 IDs with spaces/brackets/?, 2 side or "restained" suffixes, 2 duplicate pairs) and 88 warnings, 652 strand dates filled from the STSSN, and 16 lab columns listed as not imported with the reason. 636 of its 804 IDs already exist, so the database dry run would also reject those unless "Update existing samples" is ticked | 2026-11-14 |

## Findings

| # | Severity | Finding | Fix | Retested |
| --- | --- | --- | --- | --- |
| 1 | Low | All 10 `security definer` functions in `public` can be called by `anon` and `authenticated` through `/rest/v1/rpc`. The trigger functions refuse a direct call, and `is_admin` / `is_member` / `can_write` / `auth_role` only describe the caller | `revoke execute ... from anon, authenticated` on the trigger functions and `rls_auto_enable`, and revoke the helpers from `anon`, in the next migration | Fixed in 0007. 2026-11-07: anon gets 42501 calling `is_admin` and `approve_request`, and authenticated gets 42501 calling `handle_new_user`. The advisor still lists `is_admin`, `is_member`, `can_write`, `auth_role`, `approve_request`, `reject_request` and `list_requests` as callable when signed in. That's intended: the policies need the helpers, and the three rpcs check `is_admin()` themselves |
| 2 | Medium | Leaked-password protection is off. That matters more now that registration is open | Dashboard → Authentication → Providers → Email: enable leaked-password protection and set a minimum length | Partly fixed 2026-11-07: minimum length set to 10 (matches `MIN_PASSWORD`). Leaked-password protection is still off because it needs the Pro plan, and the advisor still lists it. Accepted for now: the 10-character minimum is the mitigation |
| 3 | Low | `profiles_select` and `profiles_update_self` call `auth.uid()` once per row, and profiles has two permissive UPDATE policies | Wrap the call as `(select auth.uid())`. Negligible at lab scale | Fixed in 0007 (2026-11-07). The `auth_rls_initplan` notice is gone. Two permissive UPDATE policies remain, kept for readability |
