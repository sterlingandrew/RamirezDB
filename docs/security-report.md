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
| Storage bucket policies reviewed (separate system from table RLS) | N/A: no buckets, objects or storage policies. Recheck if images move to Storage. Superseded by the 0009 section below | 2026-10-31 |
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

## Detail page and images (0009, Day 5)

The test accounts from Oct 31 no longer exist, so the pending and personnel
probes ran as accounts created inside the same transaction and rolled back.

| Check | Result | Date |
| --- | --- | --- |
| `consensus-images` bucket is private, limited to JPEG/PNG/WebP and 50 MB | Pass: `public = false`, MIME list and size limit set in 0009 | 2026-11-21 |
| pending: no upload, sees no objects, no child-table reads or writes | Pass: upload 42501, 0 objects visible, alt_id 0 rows visible, insert 42501, note/sample delete 0 rows | 2026-11-21 |
| personnel: upload and read objects; add and edit child rows; no delete, no overwrite | Pass: upload allowed, own object visible, update of objects 0 rows; alt_id insert ok, update 1, delete 0; note and sample delete 0 | 2026-11-21 |
| admin: upload, read, delete child rows; no overwrite | Pass: upload allowed, objects update 0 rows, alt_id insert/update/delete 1 each | 2026-11-21 |
| Deleting a sample that still has child rows is refused, not cascaded | Pass: admin delete of a sample with an alt ID gives 23503; the page lists the child rows first | 2026-11-21 |
| Storage object delete is admin-only through the Storage API | Policy in 0009 (`is_admin()`). Direct SQL delete on `storage.objects` is blocked by Supabase itself, so check on the page as admin and personnel | |
| CSV import adds image links to `consensus_image` with the batch id, counts them, and rolls them back with the row | Pass (rolled back): committed import's `consensus_image INSERT` carries the batch id; dry run of 4 rows reports 1 added, 2 updated, 2 images; a row whose link fails is not counted | 2026-11-21 |
| An image link can't be attached to a second turtle, even as a variant of the same Dropbox link | Pass: a link already on another sample, and the same link with `st=` removed, give 23505 naming the sample; two rows with one link in the same file give 23505 on the second; the same link on its own sample is skipped. The browser flags in-file copies first (Node test) | 2026-11-21 |
| A sample created from the form records who entered it, without the browser sending it | Pass (rolled back): personnel insert with no `entered_by` stores the caller's id (column default `auth.uid()`, 0009) | 2026-11-21 |
| Images are visible only to members: nothing is shown from Dropbox, no signed URLs are made | By design (0009, js/images.js): pages download bucket files with the viewer's session into blob: URLs. A new or changed `consensus_image` row holding a web link is refused (`consensus_image_in_bucket`, check violation, tested rolled back). All 81 legacy images are in the bucket (81 rows, 81 objects, none missing) and the constraint was validated on 2026-11-21. The old Dropbox links stay public until the lab turns them off | 2026-11-21 |
| CSV import gives each image a bucket path and source link, and returns what to copy | Pass (rolled back): committed import stores `raw_image` = `<STSSN>/<batch>-<file>`, `source_link` = the link, and returns it in `copies`; a copy of an existing link with `st=` removed is still refused | 2026-11-21 |
| Copying from Dropbox works from the browser | Dropbox's download host returns the file with `Access-Control-Allow-Origin: *` (curl and Node). To check on the page: Add link, New sample with a link, import with links, admin bulk copy | |
| Detail page end to end as personnel and admin (add / edit / delete per child table, upload, delete image, delete sample) | | |

## Findings

| # | Severity | Finding | Fix | Retested |
| --- | --- | --- | --- | --- |
| 1 | Low | All 10 `security definer` functions in `public` can be called by `anon` and `authenticated` through `/rest/v1/rpc`. The trigger functions refuse a direct call, and `is_admin` / `is_member` / `can_write` / `auth_role` only describe the caller | `revoke execute ... from anon, authenticated` on the trigger functions and `rls_auto_enable`, and revoke the helpers from `anon`, in the next migration | Fixed in 0007. 2026-11-07: anon gets 42501 calling `is_admin` and `approve_request`, and authenticated gets 42501 calling `handle_new_user`. The advisor still lists `is_admin`, `is_member`, `can_write`, `auth_role`, `approve_request`, `reject_request` and `list_requests` as callable when signed in. That's intended: the policies need the helpers, and the three rpcs check `is_admin()` themselves |
| 2 | Medium | Leaked-password protection is off. That matters more now that registration is open | Dashboard → Authentication → Providers → Email: enable leaked-password protection and set a minimum length | Partly fixed 2026-11-07: minimum length set to 10 (matches `MIN_PASSWORD`). Leaked-password protection is still off because it needs the Pro plan, and the advisor still lists it. Accepted for now: the 10-character minimum is the mitigation |
| 3 | Low | `profiles_select` and `profiles_update_self` call `auth.uid()` once per row, and profiles has two permissive UPDATE policies | Wrap the call as `(select auth.uid())`. Negligible at lab scale | Fixed in 0007 (2026-11-07). The `auth_rls_initplan` notice is gone. Two permissive UPDATE policies remain, kept for readability |
