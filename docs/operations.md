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

## Importing the backlog

Personnel import spreadsheets themselves from the **Import** page. The full
guide, with the accepted column headers, is [import.md](import.md). In short:

1. Save the sheet from Excel as **CSV UTF-8 (Comma delimited)**, at most 1000
   rows per file.
2. Import page → choose the file → fix anything listed, in the spreadsheet →
   **Dry run** → **Import**.
3. Write the batch number it reports in the import log (date, who, file, rows,
   batch #), kept at __IMPORT_LOG_LOCATION__.

**Anything confusing or broken during an import is a bug report.** Note the
file, the row and the exact message, and send it to __MAINTAINER__. These are
collected and fixed before handoff.

To undo a bad import, an admin follows "Finding and undoing a batch" in
[import.md](import.md).

## Consensus images

**Only personnel and admins may see images.** A Dropbox share link opens for
anyone who has it, so the site never shows an image from Dropbox. Every image
is copied into the private Storage bucket `consensus-images` (0009), and the
pages download it with the viewer's own sign-in and show it from memory. No
public, signed or shareable link is ever made.

**The Dropbox link is still the lab's record of an image: no link, no image.**
It's kept in `consensus_image.source_link` (members only), and the copy's
path in the bucket is in `raw_image`. A sample without an image is recorded
like any other; every image field is optional.

- **With a new sample:** the New sample form's optional Dropbox image and
  folder link fields. The file is copied in when the sample is saved.
- **Many at once:** the CSV import's `consensus.image` and `image.folder`
  columns ([import.md](import.md)). The dry run checks each link opens; after
  the import the page copies each file in. Keep the page open until it says
  done. Tick "Update existing samples" to attach links to turtles already in
  the database.
- **Add a link to an existing sample:** its page → Consensus images → Add link.
- **Upload a file:** its page → Consensus images → Upload. JPEG, PNG or WebP,
  up to 50 MB.
- **Not copied yet:** an image whose copy failed, or one of the 81 from MySQL,
  is copied automatically when personnel or an admin opens its sample page
  ("Copying into secure storage…"). If that fails, the page says why and
  offers **Try again**. There's no server of ours to do this in the
  background (ADR-001 rules out Edge Functions), so it happens in the
  browser of whoever is looking.
- **Remove one:** admin only, Delete under the image. The record goes first,
  then the file.
- Files are stored as `<STSSN>/<number>-<file name>`, and nothing ever
  overwrites a stored file.
- **Thumbnails are the full image** scaled down by the browser. Resized
  thumbnails need Storage image transformations, a Pro plan feature.

Storage access is set by policies on `storage.objects` in 0009, separate from
the table policies: members read, personnel and admin upload, admin deletes,
nobody overwrites. The `consensus_image_in_bucket` check refuses a new or
changed record whose `raw_image` is a web link.

### Copying the 81 MySQL images into secure storage (once)

1. Sign in as an admin and open **Admin**. Copying starts by itself ("Copying
   images into secure storage", with a count); keep the page open until it
   finishes. Each copy is audited (`consensus_image UPDATE`, with the old
   value). Anything that fails is listed with its sample and a **Try again**
   button.
2. When the section no longer appears on the Admin page, every image is in
   the bucket. Then, in the SQL editor, make the bucket rule apply to every
   row:

   ```sql
   alter table consensus_image validate constraint consensus_image_in_bucket;
   ```

3. **Ask the lab to turn off the Dropbox links once their files are copied**
   (Dropbox → Shared → Links → delete). Until then, anyone who has one of the
   old links can still open that image on Dropbox, whatever this site does.
   The copy needs the link to be open ("anyone with the link"), so the same
   goes for every new link: share it, add it here, and once the sample page
   shows the image, turn the link off. The record keeps the link as history;
   it simply stops opening.

Two image records (ids 30 and 34, on two different samples) link to the same
Dropbox file, whose name matches only the sample of id 34. Both are copied as
they are; the lab says which sample the image belongs to.

A local copy of the 80 files, taken on 2026-11-21, is in
`private-data/consensus-images/` on the maintainer's machine (not in git).

## Auth settings

Set in the Supabase dashboard, not in the repo, so they're listed here. If
something about sign-up or sign-in breaks, check these first.

| Setting | Where (Authentication → …) | Value | Set on |
| --- | --- | --- | --- |
| Allow new users to sign up | Sign In / Providers → User Signups | On | 2026-11-07 |
| Confirm email | Sign In / Providers → Email | On | 2026-11-07 |
| Minimum password length | Sign In / Providers → Email | 10 (must match `MIN_PASSWORD` in `js/config.js`) | 2026-11-07 |
| Password requirements | Sign In / Providers → Email | Lowercase, uppercase, digits and symbols (checked in the browser by `js/password.js`; change both together) | 2026-11-07 |
| Leaked-password protection | Sign In / Providers → Email | Off: Pro plan only. The security advisor still flags it (2026-11-07). Turn it on if the lab upgrades | 2026-11-07 |
| CAPTCHA | Attack Protection | On, provider Cloudflare Turnstile, secret key from Cloudflare | __DATE__ |
| Site URL | URL Configuration | `https://sterlingandrew.github.io/RamirezDB/` | 2026-11-07 |
| Redirect URLs | URL Configuration | `https://sterlingandrew.github.io/RamirezDB/**` only | 2026-11-07 |
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
