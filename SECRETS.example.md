# SECRETS.example.md

Copy this file to `SECRETS.md` in the project root and fill in the values.
`SECRETS.md` is gitignored and must never be committed. Keep this example file empty.

```
SUPABASE_PROJECT_REF=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_PASSWORD=
SUPABASE_DB_URL=
SUPABASE_ACCESS_TOKEN=

SU_ADMIN_EMAIL=
SU_ADMIN_PASSWORD=
SU_ADMIN_NAME=
PATABIN_ADMIN_EMAIL=
PATABIN_ADMIN_PASSWORD=
PATABIN_ADMIN_NAME=

GITHUB_TOKEN=

VERCEL_TOKEN=
VERCEL_ORG_ID=
VERCEL_PROJECT_ID=
```

Notes:
- SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY can be the legacy JWT keys or the newer publishable / secret keys.
- SUPABASE_DB_URL is the Postgres connection string (with the DB password) from Supabase, Project Settings, Database.
- SUPABASE_ACCESS_TOKEN is a personal access token from the Supabase account page.
- GITHUB_TOKEN needs write access to Seizmann/patabin (a fine-grained token with Contents: read and write is enough).
- VERCEL_PROJECT_ID can stay empty; the agent creates the project.
- The admin passwords here are temporary. Both accounts must change them at first login.
