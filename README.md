# RamirezDB

Public-facing sea turtle sample database for the Ramirez Lab.
Static client on GitHub Pages, Postgres + REST API + Auth on Supabase.

Architecture and the reasoning behind it: ADR-001.

## Live site

https://sterlingandrew.github.io/RamirezDB/

## Running it locally

There is no build step. Serve the repo root over HTTP — opening `index.html`
as a `file://` URL breaks ES modules.

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Configuration

One file, two values: `js/config.js`.

```js
SUPABASE_URL             = 'https://__PROJECT_REF__.supabase.co'
SUPABASE_PUBLISHABLE_KEY = '__SB_PUBLISHABLE_KEY__'
```

Both come from the Supabase dashboard under **Settings → API Keys**. Use the
publishable key (`sb_publishable_…`). The older `anon` / `service_role` JWT
keys are being retired by the end of 2026; if this project only shows a legacy
key tab, use the anon key and swap it when publishable keys are available.

That key is **public by design** — it ships in client JS and anyone can read
it. It is not a secret and does not need protecting. All access control lives
in the Row Level Security policies in `supabase/migrations/`.

The secret key (`sb_secret_…`, formerly `service_role`) bypasses RLS entirely.
It must never appear in this repo, in a comment, or in a commit. It belongs
only in your own terminal.

## Database

```sh
supabase link --project-ref <project ref>
supabase db push          # applies supabase/migrations/ in order
supabase db reset         # local only: rebuild + run seed.sql
```

The lab data itself is not in this repo — the repo is public. It was loaded
once from `load.sql`, which is kept with the lab's backups.

Migrations are append-only. Never edit one that has been pushed; add the next
number. Policies are SQL in this repo, never clicked into the dashboard.

## Layout

| Path | What it is |
| --- | --- |
| `*.html` | one file per screen, published from the root of `main` |
| `assets/styles.css` | the one stylesheet; design tokens at the top |
| `js/config.js` | project URL + publishable key |
| `js/supabase.js` | the single shared client |
| `js/auth.js` | session, sign-in/out, role lookup, page guard |
| `js/shell.js` | header and role-aware nav |
| `js/pages/*.js` | one module per screen |
| `supabase/migrations/` | schema, roles, policies, triggers |
| `docs/` | role matrix, operations runbook, security report |

`.nojekyll` is required: without it Pages runs the tree through Jekyll, which
silently drops any path beginning with an underscore.

## Operations

Restore a backup, promote a user to Admin, un-pause a dormant free-tier
project, who to contact: `docs/operations.md`.
