# Roles

Who may do what.

## People

| Name | Email | Role | Confirmed by | Date |
| --- | --- | --- | --- | --- |
| **\_\_NAME\_\_** | **\_\_EMAIL\_\_** | admin | **\_\_PI\_\_** | **\_\_DATE\_\_** |

## Permissions

Decided with the lab on Oct 10. C = create, R = read, U = update, D = delete. Blank = denied.

| Table | Guest (anon) | Pending | Personnel | Admin |
| --- | --- | --- | --- | --- |
| sample | | | CRU | CRUD |
| note | | | CRU | CRUD |
| alt_id | | | CRU | CRUD |
| age_reading | | | CRU | CRUD |
| extra_sample | | | CRU | CRUD |
| consensus_image | | | CRU | CRUD |
| audit_log | | | | R |
| profiles | | R (own row) | R | CRUD |

Enforced by `0003_rls_policies.sql` (insert, update, delete) and
`0006_roles.sql`, which supersedes 0003's select policies and closes its open
question. 0003 is left as it is: migrations are append-only.

## Notes

- **Guest** is not signed in. They can see the public stats page (day 7) and request access, and they get no rows from any table. Public figures are served by a named rpc with approved fields (total sample count, size distribution by species), never by loosening table policies. Nothing location-related appears at any granularity.
- **Pending** has requested access and isn't approved yet. They see what a guest sees, plus their own request. Every new account starts here.
- **Personnel** see everything, strand locations included. They can add samples, import CSVs, and edit samples and their child records. They cannot delete.
- **Admin** can do everything personnel can, plus delete, approve or reject requests, create accounts, change other people's roles, and read the audit log.
- There is no read-only member role. Setting an account back to pending revokes its access.
- **Role changes** are enforced in the database by the `profiles_role_guard` trigger. Only an admin may change a role, never their own, and the last admin can't be demoted or deleted. The SQL editor bypasses the first rule, so the first admin can be set and access recovered by hand, but not the last-admin rule.
- **Registration** is open to anyone, for collaboration, but it only creates a pending request. An admin approves it.
- **Audit logs** are read-only. Triggers write them for samples, readings, extra samples, notes, alternate IDs, images and role changes. No role can update or delete an entry.
