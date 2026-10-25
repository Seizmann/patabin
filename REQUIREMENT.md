# PataBin — REQUIREMENT.md

Build spec for AI coding agents (Claude Code / Z Code). Read this whole file before writing any code. When this file and your assumptions disagree, this file wins.

---

## 0. Agent rules (read first)

1. **Secrets** live only in `SECRETS.md` at the repo root (see §5). Read it, never print its values to logs, commits, README, PR text or chat output.
2. `SECRETS.md` must be in `.gitignore` **before the first commit**. Never commit it, never copy values into tracked files. Commit `SECRETS.example.md` (same keys, empty values) instead.
3. You run everything yourself: git, Supabase CLI (login, link, migrations, config push, edge function deploy, type generation), seed scripts, Vercel CLI. Do not ask the human to run commands. Stop and ask only when a required key in `SECRETS.md` is missing or a step fails twice for a reason you cannot fix. When you stop, list exactly which keys or actions are missing.
4. Safety on the live database (there is one cloud project, it is production):
   - Never run `supabase db reset`, `DROP TABLE`, `TRUNCATE` or any destructive statement against the linked project after seeding. Schema changes go through new migration files only.
   - SQL tests must run inside `BEGIN; ... ROLLBACK;` so they never leave data behind.
   - Never `git push --force`.
5. Commit after each phase in §13 with clear messages, and push to `origin main`.
6. Definition of done is §12 (all checks pass), not "it compiles".

---

## 1. Product summary

**PataBin** is a Bangla-language, mobile-first PWA for two partners who buy chocolates in bulk, break packets, and resell per piece. It tracks purchases (who paid for how many pieces), stock, sales (with free-form discounts), personal consumption, expenses, profit and who owes whom.

- Single product (chocolate). No product catalogue.
- Two users, two partners. The design should still work if a third partner is added later (no hardcoded "2").
- Currency BDT (৳). Timezone `Asia/Dhaka`. UI language Bangla only (strings kept in one module so English can be added later).
- Online-only. No credit sales (baki), no offline queue, no email flows.

---

## 2. Domain rules and formulas (source of truth)

### 2.1 Units
All stock is counted in **pieces (pcs)**. Packets are only a purchase/packing note (`pcs_per_packet`, informational). Never model a "packet" stock unit.

### 2.2 Batch (one purchase lot)
Each partner records how many pieces they bought and how much they paid.
- `contribution_p = amount_paid_p + (expenses paid by p with funding = own_pocket)`
- `total_pcs = Σ qty` of the batch contributions.

Batch expenses have a `cost_type`:
- `landed`: added to inventory cost (transport, packaging that is part of getting stock ready).
- `operating`: charged to profit directly, not part of per-piece cost.

`landed_pool = Σ amount_paid + Σ landed expenses`
`landed_cost_per_pc = landed_pool / total_pcs`

Per-piece cost is spread over **all** pieces bought (including personal-use ones).

### 2.3 Sales
- **External sale**: sold to a customer. `amount_received` is the actual money. `list_unit_price` is a snapshot of the default price (300) at entry. `discount = qty × list_unit_price − amount_received` (stored as generated column). Discounts are free-form: the user types the final amount, there are no discount rules or tiers. Example: 5 pcs, list 1500, received 1450, discount 50.
- **Personal use** = an **internal sale** to a partner, valued at the sell price (default 300/pc, editable). It counts as revenue to the batch and is deducted from that partner's payout.
- Every sale (both kinds) consumes stock via **FIFO** from open batches (oldest `purchase_date`, then `created_at`). A sale spanning two batches is split across them in `sale_allocations`; revenue is split pro-rata by qty.
- A sale that needs more pieces than total remaining stock must be rejected with a clear error.

### 2.4 Damage / loss / samples
`stock_adjustments` remove pieces from stock. Their cost (landed cost per pc) is a loss borne by all partners via profit sharing.

### 2.5 Per-batch numbers
Let, for one batch:
- `sold_ext`, `personal`, `damaged` = piece counts allocated to it; `remaining = total_pcs − sold_ext − personal − damaged`
- `revenue = revenue_external + revenue_internal` (allocated pro-rata)
- `realized_cost = landed_cost_per_pc × (sold_ext + personal + damaged)`
- `unsold_cost = landed_cost_per_pc × remaining`
- `operating_expenses = Σ operating expenses`
- `profit = revenue − realized_cost − operating_expenses` (this is "realized" profit; unsold stock is valued at cost and does not count as profit; once `remaining = 0` it is the final profit)

### 2.6 Profit sharing and payout (per batch, per partner p)
```
share_p  = contribution_p / Σ contribution
payout_p = contribution_p − share_p × unsold_cost + share_p × profit − personal_value_p
```
`personal_value_p` = Σ `amount_received` of internal sales of partner p (allocated pro-rata to the batch).

Meaning: capital comes back, profit is split by investment %, personal consumption is paid for at sell price. Profit % is **not** reduced again for personal use (that would double-penalise).

Rounding: `numeric(12,2)`, round half up. The partner with the larger share absorbs the rounding remainder so that Σ payout equals the exact total.

Invariant (must hold in tests): `Σ payout_p = revenue_external − expenses funded from sales_cash`.

### 2.7 Cash held, settlement and balance
- `cash_held_p = Σ external sales collected by p (received_by_partner_id) − Σ expenses paid by p with funding = sales_cash + Σ transfers received by p − Σ transfers sent by p`
- `entitlement_p = Σ over all batches payout_p` (closed batch: from its snapshot; open batch: live value)
- `balance_p = entitlement_p − cash_held_p`
  - positive: p should receive that amount
  - negative: p should hand over that amount
  - `Σ balance_p = 0`
- UI shows a plain sentence: "<A> কে <B> ৳X দেবে". A **transfer** (money handed between partners) updates the balances.

### 2.8 Closing a batch
- `close_batch` is allowed only when `remaining = 0`. If stock is left, the user must first add a write-off adjustment.
- On close, store a snapshot (summary + per-partner payout) in `batch_close_snapshots`. A closed batch rejects new allocations and edits to its contributions, expenses, adjustments and sales.
- `reopen_batch` is `su_admin` only; it removes the snapshot (the audit log keeps history).

### 2.9 Funding of expenses
- `own_pocket`: a partner paid from their own money, counts as contribution (capital) and is returned through payout.
- `sales_cash`: paid out of sales money that partner was holding. Not a contribution; it reduces their `cash_held`.

---

## 3. Roles and permissions

Two app roles (enum `user_role`):

| Capability | `su_admin` (Sijan) | `patabin_admin` (friend) |
|---|---|---|
| View everything (dashboard, reports, audit log) | yes | yes |
| Create/edit/soft-delete batches, contributions, expenses, adjustments, sales, personal use, transfers | yes | yes |
| Close a batch | yes | yes |
| Reopen a closed batch | yes | no |
| Create / deactivate users, reset passwords | yes | no |
| Change settings (default sell price) | yes | no |

Rules:
- Public signup is **disabled**. Verify by attempting a signup with the anon key; it must fail.
- Deactivated users (`profiles.is_active = false`) get no data access (enforced in RLS, not only in UI).
- No hard deletes anywhere from the app. Deleting = set `deleted_at`. No DELETE RLS policy on business tables.

---

## 4. Tech stack and repo layout

- **Package manager**: pnpm workspace monorepo (`packageManager` field set, Node 20+ LTS).
- **Web**: React + TypeScript (strict) + Vite + Tailwind CSS v4 (`@tailwindcss/vite`) + React Router + TanStack Query + react-hook-form + zod + `vite-plugin-pwa` + `@supabase/supabase-js` + `lucide-react`. Charts: `recharts` only if needed.
- **Backend**: Supabase cloud (free): Postgres, Auth, one Edge Function. Business logic in Postgres (views, functions, triggers), not in the frontend.
- **Lint/format/test**: ESLint, Prettier, Vitest (shared helpers), SQL tests via `psql`.
- **Deploy**: Vercel (see §11).

```
patabin/
  apps/web/                 # @patabin/web  (React PWA)
  packages/shared/          # @patabin/shared (zod schemas, money + Bangla digit helpers, generated DB types)
  supabase/
    config.toml
    migrations/             # timestamped .sql, forward-only
    functions/manage-users/ # edge function (Deno)
    tests/                  # *.sql tests (BEGIN ... ROLLBACK)
  scripts/                  # seed, db push, types, tests, backup, secrets loader (tsx)
  .github/                  # optional
  vercel.json               # REQUIRED, at repo root
  pnpm-workspace.yaml
  package.json
  SECRETS.md                # gitignored
  SECRETS.example.md
  REQUIREMENT.md
  README.md
```

Root scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `test:sql`, `db:link`, `db:push`, `db:types`, `db:seed`, `db:backup`, `check:secrets`, `deploy`.

Git: `git init` (if needed), branch `main`, remote `origin` = `https://github.com/Seizmann/patabin.git` (private). Authenticate with the token from `SECRETS.md` **without writing it into `.git/config`** (use a credential helper or `GIT_ASKPASS` for the process). If the remote already has commits, fetch and integrate non-destructively.

---

## 5. Secrets and environment

`SECRETS.md` format: any line matching `^[A-Z0-9_]+=.*$` (inside fenced code blocks or not) is a key. A loader in `scripts/` parses it. Required keys (also the content of `SECRETS.example.md`, values empty):

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
- `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` may hold either the legacy JWT keys or the newer publishable / secret keys; support both.
- `VERCEL_PROJECT_ID` may be empty; create/link the project with the Vercel CLI and use the token.
- **Frontend gets only** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Generate `apps/web/.env.local` from `SECRETS.md` (gitignored). The service role key, DB password and access token must never reach the web bundle. CI check: after build, grep `apps/web/dist` for the service role key and for the string `service_role`; fail if found.
- `pnpm check:secrets`: fail if `SECRETS.md` or `.env*` is tracked or staged, or if any value from `SECRETS.md` appears in a tracked file.
- Default admin passwords in `SECRETS.md` are **temporary**: both accounts are created with `must_change_password = true`.
- Do not rely on email: Supabase free SMTP is rate-limited. No email confirmation, magic links or "forgot password" emails. Create users with `email_confirm: true` through the admin API.

---

## 6. Database design (Postgres, `public` schema)

General: `uuid` PK (`gen_random_uuid()`), `created_at`, `updated_at` (trigger), `created_by default auth.uid()`, `deleted_at` on business tables. Money `numeric(12,2)`, quantities `integer`. RLS **enabled on every table**; `anon` has no access.

| Table | Key columns |
|---|---|
| `profiles` | `id` (= auth.users.id), `role user_role`, `display_name`, `must_change_password bool default true`, `is_active bool default true` |
| `partners` | `id`, `name`, `user_id unique null` |
| `settings` | singleton row: `default_sell_price default 300`, `updated_by` |
| `batches` | `code` unique (B-001 …), `purchase_date`, `unit_cost default 190` (form default only), `pcs_per_packet null`, `status` (`open`/`closed`), `closed_at`, `closed_by`, `note` |
| `batch_contributions` | `batch_id`, `partner_id`, `qty ≥ 0`, `amount_paid ≥ 0` (default qty × unit_cost, editable); unique (`batch_id`,`partner_id`) |
| `expenses` | `batch_id` NOT NULL, `spent_on`, `category` (`transport`/`packaging`/`other`), `cost_type` (`landed`/`operating`), `amount > 0`, `paid_by_partner_id`, `funding` (`own_pocket`/`sales_cash`), `note` |
| `stock_adjustments` | `batch_id`, `adjusted_on`, `qty > 0`, `reason` (`damage`/`loss`/`sample`/`other`), `note` |
| `sales` | `sold_at timestamptz`, `kind` (`external`/`internal`), `customer_name null`, `partner_id null` (the consumer, internal), `received_by_partner_id null` (collector, external), `qty > 0`, `list_unit_price`, `amount_received ≥ 0`, `discount` (generated), `payment_method null` (`cash`/`bkash`/`nagad`/`rocket`/`bank`/`other`), `note` |
| `sale_allocations` | `sale_id`, `batch_id`, `qty`; PK (`sale_id`,`batch_id`) |
| `transfers` | `transferred_on`, `from_partner_id`, `to_partner_id` (≠ from), `amount > 0`, `method`, `note` |
| `batch_close_snapshots` | `batch_id` PK, `closed_at`, `data jsonb` |
| `audit_log` | `id bigserial`, `at`, `user_id`, `table_name`, `row_id`, `action` (I/U/D), `old_data`, `new_data` |

Constraints: `internal` ⇒ `partner_id` NOT NULL and `received_by_partner_id` NULL; `external` ⇒ `received_by_partner_id` NOT NULL and `partner_id` NULL.

### RLS
- Helpers (`SECURITY DEFINER`, `stable`, fixed `search_path`): `is_active_user()`, `is_su_admin()`.
- Active users: SELECT and INSERT/UPDATE on business tables (soft-delete is an UPDATE). No DELETE policies.
- `settings` UPDATE and `profiles` writes: `su_admin` only (profile writes also via the edge function).
- `audit_log`: SELECT for active users, no direct writes (written by triggers).
- Closed-batch immutability is enforced by triggers (not only UI).
- Views use `security_invoker = true`.

### Triggers
- `updated_at` on all tables.
- Audit trigger on every business table (old/new as jsonb).
- Closed-batch guard on contributions, expenses, adjustments, allocations.

### Functions (RPC) and views
Functions (atomic, transactional, lock batch rows during allocation):
- `create_sale(payload jsonb)`, `update_sale(id, payload jsonb)`, `delete_sale(id)` — handle FIFO allocation and stock checks; update/delete recompute allocations.
- `create_batch(payload jsonb)` — batch + contributions + optional expenses in one call.
- `close_batch(id)`, `reopen_batch(id)`.

Views: `v_batch_stock`, `v_batch_summary` (all §2.5 numbers), `v_partner_batch_payout` (§2.6, uses snapshot when closed), `v_partner_balance` (§2.7), `v_dashboard_totals`, `v_sales_enriched` (with discount %, batch codes).

Seed (idempotent, `scripts/seed`): `settings` row (price 300); two `partners` (names from `SECRETS.md`); the two auth users + `profiles` (roles `su_admin` for `SU_ADMIN_*`, `patabin_admin` for `PATABIN_ADMIN_*`, `must_change_password = true`), linked to their partner rows.

---

## 7. Edge function: `manage-users`

- Deno, `verify_jwt = true`. Reads the caller from the JWT, checks `profiles.role = 'su_admin'` and `is_active`; otherwise 403.
- Uses the injected service role env var for admin API calls.
- Actions: `create_user` (email, temp password, display_name, role, optional partner link), `reset_password` (sets a temp password and `must_change_password = true`), `set_active` (activate/deactivate).
- Proper CORS and JSON errors. Deploy with `supabase functions deploy manage-users`.
- Recovery if su_admin is locked out: `pnpm admin:reset` script (service role, from `SECRETS.md`).

Auth config (via `supabase/config.toml` + `supabase config push`, or the Management API): signups disabled, email confirmations off, set Site URL to the Vercel production URL once known.

---

## 8. Frontend (Bangla, mobile-first)

General:
- All strings in `apps/web/src/i18n/bn.ts` (no hardcoded UI text in components).
- Font: Noto Sans Bengali, self-hosted via `@fontsource` (works offline in the PWA).
- Show numbers with Bangla digits and lakh grouping (`Intl.NumberFormat('bn-BD')`), currency ৳, dates in `Asia/Dhaka`. **Inputs must accept both Bangla and English digits** (normalise on input; `type="text" inputMode="decimal"`).
- Bottom tab bar on mobile: হোম · বিক্রি · ব্যাচ · খরচ · আরও. Large tap targets, light and clean, one-hand use.
- Every list is searchable/filterable by date; empty and loading and error states in Bangla.
- Never optimistic-update money values; refetch after write.

Pages:
1. **লগইন**, then forced **পাসওয়ার্ড পরিবর্তন** while `must_change_password` is true.
2. **হোম**: stock left, today and this month sales, revenue, discount total, estimated profit, each partner's balance sentence ("X কে Y ৳Z দেবে"), quick buttons: নতুন বিক্রি, ব্যক্তিগত ব্যবহার.
3. **নতুন বিক্রি**: quantity stepper; amount auto-fills `qty × price` and is editable; live discount (৳ and %); optional customer name; payment method; `received_by` defaults to the logged-in user's partner; save in ~3 taps. Stock check message if not enough.
4. **ব্যক্তিগত ব্যবহার**: partner, qty, amount defaulting to `qty × price` (editable).
5. **বিক্রির তালিকা**: filter by date/customer/kind, edit and soft-delete with confirmation.
6. **ব্যাচ**: list with status chip; **নতুন ব্যাচ** form (date, unit cost, per-partner qty + amount paid, optional packet size, expenses). Batch detail: contributions, expenses, adjustments, stock, summary numbers, per-partner payout, **ব্যাচ বন্ধ করুন** / **আবার খুলুন** (su_admin).
7. **খরচ**: add/list (batch required, category, cost type, who paid, funding).
8. **নষ্ট/ক্ষতি**: add adjustment.
9. **হিসাব মেটানো**: balances, transfer form, transfer history.
10. **রিপোর্ট**: batch-wise and partner-wise, date range, CSV export.
11. **পরিবর্তনের ইতিহাস** (audit log viewer).
12. **ব্যবহারকারী** (su_admin only): create, reset password, activate/deactivate.
13. **সেটিংস** (su_admin only): default sell price.

Route guards by role and `is_active`. Role is read from `profiles`, never trusted from the client.

Glossary (use consistently): batch = ব্যাচ, sale = বিক্রি, discount = ছাড়, personal use = ব্যক্তিগত ব্যবহার, stock = স্টক, expense = খরচ, profit = লাভ, payout = প্রাপ্য, balance = পাওনা/দেনা, settlement = হিসাব মেটানো, cash = ক্যাশ, received by = টাকা গ্রহণকারী.

---

## 9. PWA

- `vite-plugin-pwa`, `registerType: 'autoUpdate'`, manifest: name "PataBin", short_name "PataBin", `lang: 'bn'`, `display: 'standalone'`, `start_url: '/'`, theme/background colours, icons 192 and 512 plus maskable (generate simple placeholder icons).
- Cache only the app shell and static assets. **Never cache Supabase API responses.**
- When offline: show a Bangla banner and disable save buttons (no offline writes).
- Must pass the installability check in Chrome (Lighthouse PWA/installable).

---

## 10. Quality bar
- TypeScript strict, no `any` in app code, DB types generated into `packages/shared` (`supabase gen types typescript --linked`).
- zod validation on all forms, mirrored by DB constraints.
- Accessible labels, sensible contrast, works at 360px width.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all green.

---

## 11. Deployment (Vercel)

`vercel.json` at the **repo root is mandatory**. Use exactly this shape (adjust only if the build needs it):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm --filter @patabin/web build",
  "outputDirectory": "apps/web/dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    },
    {
      "source": "/(sw.js|registerSW.js|manifest.webmanifest)",
      "headers": [{ "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }]
    },
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

Steps (agent does all via Vercel CLI and the token):
1. Create/link the project (root directory = repo root), no interactive prompts.
2. Set production env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (only these).
3. Try `vercel git connect` for GitHub auto-deploy from `main`. If it fails, deploy with `vercel --prod` and note in README that git-connect needs a one-time dashboard step. Do not loop on it.
4. Set the Supabase Auth Site URL to the production URL.
5. Open the production URL and verify login, a sale, a batch and the PWA manifest.

---

## 12. Testing and acceptance (must all pass)

SQL tests in `supabase/tests/*.sql`, each wrapped in `BEGIN; ... ROLLBACK;`, using `DO $$ ... ASSERT ... $$`, run by `pnpm test:sql` via `psql` with `SUPABASE_DB_URL`.

**Test A — core example.** Batch: unit cost 190. Partner S buys 100 pcs (paid 19,000), partner F buys 200 pcs (paid 38,000), no expenses. Sales: external 265 pcs at 300 = 79,500, external 5 pcs for 1,450 (list 1,500, discount 50), personal use S 8 pcs = 2,400, F 22 pcs = 6,600. Remaining stock 0.
Expected: shares 33.33% / 66.67%; revenue 89,950; cost 57,000; profit 32,950; payout S = **27,583.33**, payout F = **53,366.67**; Σ payout = 80,950 = external revenue.

**Test B — landed expense.** Same as A plus transport 600 (`landed`, paid by F, `own_pocket`). Expected: contributions S 19,000 / F 38,600; profit 32,350; payout S = **27,271.01**, F = **53,678.99**; Σ = 80,950.

**Test C — settlement.** In A, F collected all external cash (80,950). Balances: F −27,583.33, S +27,583.33. After a transfer F→S of 27,583.33 both balances are 0.

**Other required checks:**
- FIFO: a sale spanning two open batches splits allocations and revenue pro-rata; oldest batch is consumed first.
- Selling more than remaining stock is rejected; failed attempts leave no rows.
- Closed batch: new allocation, contribution/expense/adjustment edits are rejected; `close_batch` fails when stock remains; `reopen_batch` is rejected for `patabin_admin`.
- Open-batch invariant `Σ payout = revenue_external − expenses from sales_cash` holds with unsold stock.
- Soft delete of a sale restores stock and balances; audit rows exist for insert, update and delete.
- RLS: `anon` reads nothing; deactivated user reads nothing; `patabin_admin` cannot call `manage-users`, change settings, or reopen a batch.
- Signup with the anon key fails.
- Frontend Vitest: money rounding, Bangla/English digit normalisation, discount calculation.
- `pnpm check:secrets` and the bundle grep (§5) pass.
- Production smoke test on the Vercel URL (§11 step 5).

---

## 13. Build order (commit and push after each phase)

1. Monorepo scaffold, `.gitignore` (incl. `SECRETS.md`, `.env*`, `backups/`), `SECRETS.example.md`, `check:secrets`, git remote and first push.
2. Supabase: login with access token, link project, `config.toml`, migrations for tables, constraints, RLS, triggers, functions, views; `db push`; generate types.
3. SQL tests A–C and the other checks; fix until green.
4. Seed script: settings, partners, both users and profiles; auth config (signups off).
5. Edge function `manage-users` + deploy + test.
6. Web app foundation: auth, guards, Bangla i18n, layout, forced password change.
7. Feature pages in the order of §8 (sales and batches first).
8. PWA (manifest, icons, service worker, offline banner).
9. `vercel.json`, Vercel project, env vars, deploy, production verification.
10. `db:backup` script (JSON export of all business tables via service role into gitignored `backups/`), README (setup, scripts, role matrix, how to reset su_admin password, free-tier pause note), final full test run.

---

## 14. Out of scope (do not build)
Credit sales / customer dues, offline write queue, multiple products or price lists, automatic discount tiers, email or SMS flows, English UI, customer database, native apps, payment gateway integration.

---

## 15. Design addendum (overrides §8 where they conflict)

Reference: the "BSZ Ledger" dashboard screenshot. Light mode only — no dark mode, no `dark:` classes, `color-scheme: light`. Premium, calm, editorial feel.

- Page background warm off-white `#F5F1EA`. Cards white, radius 24px, 1px soft warm border, almost no shadow, generous padding.
- Header: small uppercase letter-spaced muted app label above a large bold page title; compact month/period selector at top right.
- Stat cards in a 2-column grid on mobile: tiny uppercase muted label, large semibold number with ৳ and Bangla digits; positive values muted green `#2F6B4F`, negative muted red `#B3472F`.
- Hero card: full-bleed photo (`dashboard-hero.webp`) with dark gradient overlay and white text, plus a footer strip (e.g. last sync time).
- Charts: donut and bar charts in cocoa/caramel/green tones inside white cards.
- Mobile bottom navigation: fixed bottom bar (white, 1px top border, safe-area padding) with exactly 6 icon-only tabs, outline icons (lucide-react); muted grey inactive, espresso/cocoa active with a small active indicator; each tab has an `aria-label` in Bangla: হোম, বিক্রি, ব্যাচ, খরচ, হিসাব, আরও. "আরও" opens a sheet with: রিপোর্ট, নষ্ট/ক্ষতি, পরিবর্তনের ইতিহাস, ব্যবহারকারী (su_admin only), সেটিংস (su_admin only), প্রোফাইল, লগআউট. This replaces the 5-tab bar in §8.
- Desktop (≥1024px): the bottom bar becomes a left sidebar (logo-mark/wordmark on top, icon + Bangla label items, "আরও" items listed inline). Content sits in a centered container (max ~1200px); stat cards 4-up, lists become tables with sticky headers, forms open in a side panel or dialog instead of full pages.
- Responsive is a hard rule: every page must work at 360px, 768px and ≥1280px with no horizontal scroll, touch targets ≥44px, no hover-only interactions.
- Image assets and full generation prompts: see `docs/image-prompt.md` (login-bg, 404-bg, dashboard-hero, empty-*, offline, app-texture, logo-mark, wordmark).

### 15.1 Image staging and OG meta
- Images live in `docs/img/`; the frontend phase copies them to final paths as described in `docs/image-prompt.md`.
- Derive PWA icons (192, 512, maskable 512 on the `#F5F1EA`-compatible brand background, apple-touch 180, favicon) from `logo-mark.png` with a `sharp` script in `scripts/`.
- `apps/web/index.html` must include: `<title>`, `theme-color` `#F5F1EA`, `og:type`, `og:site_name` (PataBin), `og:title`, `og:description` (short Bangla text), `og:image` as an absolute URL to the production domain, `og:image:width` 1200, `og:image:height` 630, `twitter:card` `summary_large_image`.
