# PataBin — Deploy (Vercel, manual)

The project deploys manually from GitHub; no CI deploy exists and no Vercel CLI step runs from this repo.

## 1. Vercel project settings

1. Create a project from the GitHub repo `Seizmann/patabin`.
2. In the dashboard set **Root Directory = `apps/web`** (this is required; the config file lives at `apps/web/vercel.json`, not the repo root).
3. Framework is taken from the config (`vite`); install/build commands come from `apps/web/vercel.json`:

   - Install: `pnpm --dir ../.. install --frozen-lockfile`
   - Build: `pnpm --dir ../.. --filter @patabin/web build`
   - Output: `dist`

4. Production environment variables (Project Settings > Environment Variables):

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SITE_URL` (the production URL, e.g. `https://patabin.vercel.app`; used for canonical/OG tags; `apps/web/vercel.json` was generated with the Supabase URL baked into the CSP `connect-src`, regenerate it with `pnpm gen:vercel` if the project URL changes)
   - `VITE_AGENT_URL` (`https://patabin-ai.vabo.top` in production, `http://localhost:8787` in development; the agent origin is already in the CSP `connect-src`)

5. Deploy manually (Deploy button / `vercel --prod` from a machine you control). The build must never include `SUPABASE_SERVICE_ROLE_KEY`; a committed check ensures the bundle is clean.

## 1b. Patabin Agent service (apps/patabin-ai, Docker Compose)

The Go agent service runs on the owner's Linux Mint machine, not in the cloud:

1. Docker must be enabled at boot (`sudo systemctl enable docker`).
2. `pnpm agent:env` generates `apps/patabin-ai/.env` from `SECRETS.md` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOWED_ORIGINS`). It never receives the service role key or any LLM provider key.
3. `pnpm agent:up` builds the distroless image and starts the container bound to `127.0.0.1:8787` only.
4. `pnpm agent:logs` follows logs; `pnpm agent:down` stops it.
5. LLM provider keys are not set anywhere on the machine: the owner enters them in the web app at `/settings/agent`, and they are stored in Supabase Vault only.
6. `https://patabin-ai.vabo.top` is served by a host-level Cloudflare Tunnel (`cloudflared`) that forwards to `http://localhost:8787`; the tunnel is a root systemd service the owner sets up separately.
7. Healthcheck: `curl http://127.0.0.1:8787/healthz` must return `{"ok":"true"}` after `pnpm agent:up`.

## 2. Supabase Auth Site URL

- Supabase Dashboard > Authentication > URL Configuration > Site URL: set to the production URL (`https://…vercel.app/`). Until this step, password-change redirects still work, but any email-free flows are unaffected (SMTP is unused).
- After the first deploy, also set the edge function secret allowing only that origin (localhost works only while `ALLOWED_ORIGINS` is unset — dev mode):

  ```
  supabase secrets set ALLOWED_ORIGINS=https://<production-domain>
  ```

## 3. First login

1. Open the production URL, log in with the seeded admin email and the temporary password from `SECRETS.md`.
2. The app forces a password change (at least 10 characters); everything stays read-blocked until it is done.
3. The other partner logs in the same way.

## 4. Backup

`pnpm db:backup` writes a JSON snapshot of every business table into `backups/` (gitignored). Run it regularly; the file name is a timestamp, old snapshots are kept.

## 5. Deployment

No automated deploy. After each accepted change: commit on `main` and push once; then deploy manually from Vercel (Deploy hook or CLI). The last step after every push is verifying the production URL shows the latest Commit SHA in a hard-refresh (the PWA service worker auto-updates on next open).

## 6. Supabase pause (free tier)

The free-tier project pauses after a week of inactivity; restore it from the Supabase dashboard (Restore project) and run `pnpm db:backup` at least weekly to keep data safe from more quiet periods.
