# Roles

Who may do what.

## People

| Name | Email | Role | Confirmed by | Date |
| --- | --- | --- | --- | --- |
| **\_\_NAME\_\_** | **\_\_EMAIL\_\_** | admin | **\_\_PI\_\_** | **\_\_DATE\_\_** |

## Permissions

C = create, R = read, U = update, D = delete. Blank = denied.

| Table | guest/anon | user | admin |
| --- | --- | --- | --- |
| sample | R | CRU | CRUD |
| note | R | CRU | CRUD |
| alt_id | R | CRU | CRUD |
| age_reading | R | CRU | CRUD |
| extra_sample | R | CRU | CRUD |
| consensus_image | R | CRU | CRUD |
| audit_log | | R | R |
| profiles | | R | CRUD |

## Notes

- **Guest/Anon** has read-only access to a basic, public-facing view of lab data. Access to protected fields and full table data is not permitted. Public access should be implemented through named views or RPCs with explicitly approved fields, never by loosening table-level policies.
- **User** can create, read, and update lab records but cannot delete records. Users cannot change their own role or grant themselves additional permissions.
- **Admin** has full create, read, update, and delete permissions for lab data and can register new user accounts and manage user profiles and roles.
- **Audit logs** are read-only. No role can update or delete existing audit log entries. Log creation should be handled through trusted database functions or backend operations, not direct client writes.
- **Role management** is restricted to authorized admin operations. No one, including an admin, can change their own role through profile updates.
- **Account registration** is an admin-only operation for creating new User accounts. Creating an account must not allow the requester to assign themselves admin privileges. Initial admin provisioning must be handled separately through a trusted process.
