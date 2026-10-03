# Security report

Filled in during Sprint 5. Stubbed now so the pass has somewhere to land.

Method: with only the public publishable key, and then as each role, attempt every
operation the role should not be able to perform. Queries in
`supabase/tests/policies.sql`.

## Coverage

| Check | Result | Date |
| --- | --- | --- |
| RLS enabled on every table, view and function | | |
| Publishable key alone returns zero rows from every table | | |
| `user` cannot insert, update or delete any data table | | |
| `user` cannot change their own role | | |
| `user` cannot edit another member's profile | | |
| `personnel` cannot delete | | |
| Nobody can update or delete `audit_log` | | |
| Storage bucket policies reviewed (separate system from table RLS) | | |
| Dashboard security advisor clear | | |
| Dashboard performance advisor clear | | |
| Leaked-password protection and minimum length on | | |
| Allowed origins restricted to the Pages domain | | |

## Findings

| # | Severity | Finding | Fix | Retested |
| --- | --- | --- | --- | --- |
| 1 | | | | |
