# Operations

For whoever maintains this after the current developer. Written to be followed
by someone who is not a programmer.

Fill in every __PLACEHOLDER__ before handoff. An unfilled runbook is worse than
none — it reads as if the question was answered.

## Who to contact

| For | Person | Contact |
| --- | --- | --- |
| The site and database | __MAINTAINER__ | __EMAIL__ |
| Lab data questions | __PI__ | __EMAIL__ |
| Account requests | __ADMIN__ | __EMAIL__ |

## The two services

| | Where | Who owns the account |
| --- | --- | --- |
| Website | GitHub Pages, repo `sterlingandrew/RamirezDB` | sterlingandrew (move to a lab account before handoff) |
| Database, API, logins | Supabase project `__PROJECT_REF__` | __SUPABASE_OWNER__ |

Both accounts must be owned by the lab, not by a student. If either is still on
a personal account, that is the first thing to fix.

## The site is down

1. Check the Supabase project at https://supabase.com/dashboard/project/__PROJECT_REF__. **If it says paused, that is
   almost certainly the problem** — free-tier projects pause after about a week
   of no use, which a lab with a field season will hit every year. Click Restore
   and wait a few minutes.
2. Check https://www.githubstatus.com and https://status.supabase.com.
3. If the page loads but no data appears, open the browser console; an error
   mentioning `JWT` or `policy` is an auth or policy problem, not an outage.

## Backups

Free-tier automated backups are limited, so the lab takes its own.

```sh
supabase db dump --project-ref __PROJECT_REF__ -f ramirezdb-$(date +%F).sql
```

- Schedule: weekly, plus before any migration
- Stored at: __BACKUP_LOCATION__ (not only on one laptop)
- Responsible: __PERSON__

**A backup that has never been restored is not a backup.** Restore one into a
scratch Supabase project once a year and confirm the row counts match. Record
the date of the last successful test restore here: __LAST_RESTORE_TEST__.

## Promote someone to Admin

Preferred: sign in as an admin, open the Admin page, change their role, save.

If no admin account is reachable, in the Supabase SQL editor:

```sql
update profiles set role = 'admin' where email = 'them@example.edu';
```

## Add a new lab member

1. Supabase dashboard → Authentication → Users → invite by email.
2. A `profiles` row is created automatically at role `user`.
3. Promote to `personnel` if they need to add or edit records.

Public sign-up is off by design — accounts are created by an admin.

## Deploying a change

Every push to `main` is a deploy; there is no staging. Work on a branch, open
a pull request, merge when it is right.

## Rotating keys

- The **publishable key** is public and lives in `js/config.js`. Rotating it
  means editing that file and pushing.
- The **secret key** (`sb_secret_…`, formerly `service_role`) must never be in
  the repo. If it ever is, rotate it in the dashboard immediately — removing
  the commit is not enough.
- The old MySQL password is still in the `turtlesite` git history. Rotate it
  regardless; it is overdue and unrelated to this stack.
