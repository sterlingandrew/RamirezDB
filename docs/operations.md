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

## Access requests

Anyone can ask for an account at `request-access.html` (linked from the sign-in
page). They confirm their email, then wait on `pending.html` and see no
records until an admin approves them.

**Nobody is emailed when a request arrives.** That would need an Edge Function,
which ADR-001 rules out. Instead, a red number appears on the **Admin** link in
the header whenever confirmed requests are waiting.

- Check the badge: weekly, and during field season more often
- Responsible: __ADMIN__

### Approve a request

1. Sign in as an admin and open **Admin**. Waiting people are under **Requests**,
   with their affiliation, reason and the date they asked.
2. Click **Approve**. They become `personnel` straight away. The change is
   recorded in the audit log as a `profiles UPDATE`.
3. They are not emailed. If you know them, tell them they can sign in.

Approve stays greyed out until they've clicked the link in their confirmation
email.

### Reject a request

Click **Reject**, then **Yes, delete request**. The account is deleted (they
can request again later) and the request is kept in the audit log as
`profiles REJECT`. Only pending accounts can be rejected this way. To remove a
member, set them back to `pending` first.

### Create an account directly

For someone you already know, skipping the request form:

1. Supabase dashboard → Authentication → Users → **Invite user**, enter their
   email.
2. They get an invite email, click it and choose a password (they can use
   **Forgot your password?** on the sign-in page if the link expires).
3. Their account appears under **Requests** as pending. Approve it there, or
   change the role on the Admin page.

### Revoke someone's access

Admin page → Members → set their role to `pending` → Save role. They'll see the
pending page from then on. Their past edits keep their name.

## Auth settings

Set in the Supabase dashboard, not in the repo, so they're listed here. If
something about sign-up or sign-in breaks, check these first.

| Setting | Where (Authentication → …) | Value | Set on |
| --- | --- | --- | --- |
| Allow new users to sign up | Sign In / Providers → User Signups | On | __DATE__ |
| Confirm email | Sign In / Providers → Email | On | __DATE__ |
| Minimum password length | Sign In / Providers → Email | 10 (must match `MIN_PASSWORD` in `js/config.js`) | __DATE__ |
| Leaked-password protection | Sign In / Providers → Email | On (Pro plan only; if the project is on Free, note "unavailable" here) | __DATE__ |
| CAPTCHA | Attack Protection | On, provider Cloudflare Turnstile, secret key from Cloudflare | __DATE__ |
| Site URL | URL Configuration | `https://sterlingandrew.github.io/RamirezDB/` | __DATE__ |
| Redirect URLs | URL Configuration | `https://sterlingandrew.github.io/RamirezDB/**` only | __DATE__ |
| Confirm signup email | Emails → Templates | Subject and body from `supabase/templates/confirmation.html` | __DATE__ |
| SMTP | Emails → SMTP Settings | __SMTP_PROVIDER__ (sender `__SENDER__`) | __DATE__ |

Notes:

- **Turnstile has two keys.** The site key is public and goes in
  `js/config.js` (`TURNSTILE_SITE_KEY`). The secret key goes only in the
  Supabase CAPTCHA setting. Both come from the Cloudflare dashboard →
  Turnstile, widget hostname `sterlingandrew.github.io`. Turning CAPTCHA on
  in Supabase before the site key is deployed blocks every sign-in.
- **The Site URL and redirect list contain the GitHub Pages address.** When the
  repo moves to a lab account (Day 9), the address changes: update both
  settings and the Turnstile widget hostname the same day, or confirmation and
  reset links will stop working.
- **Supabase's built-in email** only delivers to members of the Supabase
  project and a few messages an hour. Real requests need the custom SMTP
  above.

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
