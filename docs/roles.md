# Roles

Who may do what. This is the document the lab signs off on, and the spec that
`supabase/migrations/0003_rls_policies.sql` implements. If the two disagree,
the policies are what is actually true — fix one or the other, don't leave them
apart.

Get the Admin / Personnel / User lists in writing from the lab (ADR-001 open
question 3) before filling this in.

## People

| Name | Email | Role | Confirmed by | Date |
| --- | --- | --- | --- | --- |
| __NAME__ | __EMAIL__ | admin | __PI__ | __DATE__ |

## Permissions

C = create, R = read, U = update, D = delete. Blank = denied.

| Table | anon | user | personnel | admin |
| --- | --- | --- | --- | --- |
| sample | | R | CRU | CRUD |
| note | | R | CRU | CRUD |
| alt_id | | R | CRU | CRUD |
| age_reading | | R | CRU | CRUD |
| extra_sample | | R | CRU | CRUD |
| consensus_image | | R | CRU | CRUD |
| audit_log | | | | R |
| profiles | | R | R | CRUD |

Notes:

- `anon` has no access to any table. A public tier, if the lab wants one, is a
  named view or rpc — never a table with a loosened policy.
- Nobody can update or delete `audit_log`. There is no policy for those
  operations, so Postgres denies them.
- Nobody can change their own `role`, including admins acting on themselves.

## Unresolved

OPEN: may `user` see strand locations and nesting fields for protected
species? ADR-001 open question 2. The select policies in 0003 assume yes;
change them here and there together if the answer is no.
