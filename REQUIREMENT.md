# PataBin — REQUIREMENT.md (revision 2)

Build spec for AI coding agents. Read this whole file before writing any code. When this file and your assumptions disagree, this file wins.

**Revision 2 — own-stock model.** The earlier batch-contribution model (shared profit split by contribution %, FIFO across all batches) is REPLACED. Each partner owns their own stock; profit from a partner's packets belongs to that partner alone. This file is consolidated: previous session-override sections are merged here.

---

## 0. Agent rules (read first)

1. **Secrets** live only in `SECRETS.md` at the repo root (see §5). Read it, never print its values to logs, commits, README, PR text or chat output.
2. `SECRETS.md` must be in `.gitignore` before the first commit. Never commit it, never copy values into tracked files. Commit `SECRETS.example.md` (same keys, empty values) instead.
3. You run everything yourself: git, Supabase CLI (login, link, migrations, config push, edge function deploy, type generation), seed scripts, Vercel steps that are scripted. Do not ask the human to run commands. Stop and ask only when a required key in `SECRETS.md` is missing or a step fails twice for a reason you cannot fix. When you stop, list exactly which keys or actions are missing.
4. Safety on the live database (one cloud project, treated as production):
   - Never run `supabase db reset`, `TRUNCATE` or destructive statements against the linked project after seeding.
   - Revision 2 is a model pivot (see §15). Schema replacement requires a `db:backup` first and explicit user confirmation before any DROP of v1 tables.
   - SQL tests must run inside `BEGIN; ... ROLLBACK;` so they never leave data behind.
   - Never `git push --force`.
5. Commit after each phase in §13 with clear conventional-commit messages, and push to `origin main`.
6. Definition of done is §12 (all checks pass), not "it compiles".

---

## 1. Product summary

**PataBin** is a Bangla-language, mobile-first PWA for two partners (Sijan = `su_admin`, Bappy = `patabin_admin`) who buy chocolates in bulk, break them into packets, and resell per piece.

- Buy rate ~190 BDT/pc (paikari). Sell rate 300 BDT/pc. Free-form discounts.
- **Own-stock model**: at chalan (purchase) entry each partner pays for his own pieces from his own pocket. Stock is packed into packets owned by the buying partner. Whatever is sold from a partner's packet belongs to that partner (revenue and profit). No shared profit-percentage split.
- Sijan does the selling; Bappy's money still sits in shared wallets, so the app must track **per-partner balances** ("who gets what from the cash pool") plus **shared wallet balances**.
- Business runs chalan by chalan: a chalan is an independent unit of accounts, gets settled and closed, then a new chalan starts fresh.
- Two users, two partners. No hardcoded "2". Currency BDT (৳). Timezone `Asia/Dhaka`. UI language Bangla only (strings in one module so English can be added later).
- Online-only. No credit sales (baki). No offline write queue.

---

## 2. Domain model (source of truth)

### 2.1 Units
All stock is counted in **pieces (pcs)**. Packets are packing units, never a stock unit. Money `numeric(12,2)`.

### 2.2 Chalan (one purchase lot)
- Chalan = one bulk purchase. Fields: `code` (C-001, C-002 …), `purchase_date`, `buy_rate` (form default from settings, editable), `pcs_per_packet` (form default from settings, default 20, editable), `status` (`open`/`closed`), `note`.
- Per partner purchase rows: `partner_id`, `qty`, `amount_paid` (defaults to `qty × buy_rate`, editable). **Each partner pays with his own money (own pocket)** — capital is never funded from wallets.
- Transport and any other cost are NOT mixed into the chocolate price. They are expenses (§2.8), attributed manually.

### 2.3 Packing and packets
- Packing converts a chalan's un-packed stock into packets. Multiple packing sessions per chalan are allowed. Packet size defaults to the chalan's `pcs_per_packet` but is editable per packing session (e.g. 20 or 25).
- `packets`: `chalan_id`, `code` (P-01, P-02 … unique within chalan), `owner_partner_id`, `total_pcs`. The UI always shows the owner (Sijan's / Bappy's packet).
- Before or during packing, a partner may record **personal kept pcs** (khawar stock) from his own chalan purchase — recorded as personal use (§2.6) with `packet_id = NULL` at the time of keeping. Example: bought 220, kept 20, packed 200.
- Packet and chalan code display together as `C-001/P-01` where useful. No repack/merge operations in v1.

### 2.4 Sell priority (drag & drop)
- The packets page shows the open chalan's packets as a **priority list**, reorderable on mobile by drag & drop (`@dnd-kit`).
- Sales consume stock strictly in priority order: from the first packet that has stock; if a sale needs more pieces than that packet has, the rest auto-cuts from following packets. A sale spanning packets records one allocation row per packet (packet_id, qty).
- Example: P-01 (Sijan, 3 left), P-02 (Bappy), customer buys 5 → 3 pcs from P-01, 2 from P-02, both packet numbers shown on the sale.
- The priority list covers packets of ALL open chalans (a leftover packet from an older open chalan is still sellable and sits in the same list). Closed chalans reject new allocations.

### 2.5 Sales (external)
- Per-sale entry: `qty`, `list_unit_price` (snapshot of the default sell price, 300), `amount_received` (actual money; discount is free-form: user types the final amount), `discount` = `qty × list_unit_price − amount_received` (generated column), `customer_name`, `customer_phone`, `wallet_account_id` (where the payment landed — mandatory), `note`, `sold_at`.
- Example: 10 pcs, list 3000, received 2900 → discount 100.
- Revenue attribution: split pro-rata by qty across allocation rows; each allocation's revenue belongs to the packet's owner. A sale spanning two partners' packets splits revenue accordingly (20/5 pcs → 20/25 of `amount_received` to the first, 5/25 to the second).
- A sale needing more pieces than total remaining stock in open packets must be rejected with a clear Bangla error; failed attempts leave no rows.
- Selling is normally done by Sijan; no collector field. `created_by` covers audit.

### 2.6 Personal use (internal consumption)
- A partner eating pieces is a personal-use entry: `eater_partner_id`, `qty`, `packet_id` (or NULL for kept pcs outside packets), `unit_value` (default = current sell price, editable), `note`, `at`.
- Eaten from **another partner's** packet → valued at the unit value and **owed to the packet owner**: the owner's account is credited (internal revenue), the eater's account is debited the same amount ("sell er packet theke khaile 300 taka dhora hobe").
- Eaten from **own** packet or own kept pcs → no cash movement, only stock depletion (cost of own goods).
- Kept pcs (`packet_id = NULL`) always belong to the eater.

### 2.7 Gifts / free pieces and damage
- `stock_adjustments` remove pieces from a specific packet: `reason` (`gift`/`damage`/`loss`/`sample`/`other`), optional `person`/`note`. The UI asks **from which packet and whose packet** the free pieces are given.
- The cost of adjusted pcs is borne by the packet owner: it flows into that owner's accounting as `buy_rate × qty` (a real cost of goods that were bought but not sold).
- Record enough history (person, note) so gifts are traceable.

### 2.8 Expenses and withdrawals
- Expense entry: `category`, `amount > 0`, `paid_by_partner_id` (whose money went out), `attributed_to_partner_id` (whose expense it is — **manually selected at entry**), `wallet_account_id` (NULL = paid from own pocket, outside the app), `chalan_id` NULL (optional link, e.g. transport for a chalan), `note`, `spent_at`.
- Categories are a managed list seeded with: `transport`, `cigarette`, `mobile recharge`, `others`; `su_admin` can add categories.
- Attribution rules:
  - Recharge for Bappy's phone paid by Sijan → paid_by Sijan, attributed_to **Bappy**. It reduces Bappy's balance; because Sijan paid from his own pocket, Sijan is automatically reimbursed (credited) the same amount from the cash pool.
  - Expense paid from a wallet → the wallet decreases; attribution still decides whose cost it is.
  - An expense paid by X from own pocket and attributed to X → no balance effect beyond the record.
- `withdrawals`: a partner taking money out of a wallet for himself (`partner_id`, `wallet_account_id`, `amount`, `note`). Reduces the wallet and that partner's balance. Transport fee is usually entered as an attributed expense, not a withdrawal.

### 2.9 Wallets (shared cash pool)
- Wallet = a real money location, **shared** (not per-partner). Types: `cash`, `bkash`, `nagad`. Multiple bkash/nagad accounts can be added (each is one wallet row with a label).
- Money in: external sales `amount_received` (records which wallet/account received it).
- Money out: wallet-paid expenses, withdrawals, MFS→Cash cashout charges.
- `wallet_transfers`: `from_wallet_id`, `to_wallet_id`, `amount > 0`, `charge` (numeric, default 0), `note`, `at`.
  - Cash ↔ MFS: charge 0.
  - MFS → Cash: **custom cashout charge** entered at transfer time; the destination cash increases by `amount − charge`, and the charge is recorded so it is visible (the charge is also an outflow of the pool, debited to the transfer creator's chosen attribution — pick `attributed_to_partner_id` on the transfer form).
- Wallet balance for each account must always be visible. Wallet totals and per-partner balances are displayed separately (§2.10).

### 2.10 Per-partner accounting (per chalan, per partner p)
```
capital_p        = Σ amount_paid of p's purchase rows (own pocket money)
sold_pcs_p       = pcs sold from p's packets
ext_rev_p        = Σ amount_received allocated to p's packets (pro-rata)
internal_rev_p   = Σ unit_value × personal pcs eaten by the OTHER partner from p's packets
kept_pcs_p       = personal kept pcs (packet_id NULL)
gift_loss_pcs_p  = pcs removed from p's packets via stock_adjustments
consumption_due_p = Σ unit_value × pcs p ate from OTHER packets
pcs_out_p        = sold_pcs_p + kept_pcs_p + gift_loss_pcs_p + personal pcs eaten from p's packets (any eater)
cost_p           = buy_rate × pcs_out_p
profit_p         = ext_rev_p + internal_rev_p − cost_p
expenses_attributed_p = Σ expenses attributed to p
pocket_paid_p    = Σ expenses paid_by p with wallet NULL (reimbursement)
withdrawn_p      = Σ withdrawals by p
 entitlement_p   = capital_p + profit_p
                   − consumption_due_p
                   − expenses_attributed_p
                   + pocket_paid_p
                   − withdrawn_p
```
- Positive `entitlement_p`: p should receive that amount from the cash pool. Negative: p owes the pool.
- Live entitlement is recomputed while the chalan is open; a closed chalan uses its snapshot.

### 2.11 Closing a chalan and settlement
- `close_chalan` is allowed only when every packet of the chalan has 0 remaining (stock must be depleted via sales, personal use, gifts, or damage/loss adjustments).
- Settlement screen (before/while closing) shows, per partner: capital back, profit, consumption due, attributed expenses, withdrawals, and the final plain sentence "A কে B ৳X দেবে" style balance statements.
- On close, store a snapshot (summary + per-partner figures + wallet balances) in `chalan_close_snapshots`. Closed chalans reject new allocations and edits to their purchases, packets, sales, personal uses, adjustments, expenses (linked), and transfers.
- `reopen_chalan` is allowed for both roles (no business rule blocks it), logged in the audit log.
- A new chalan starts fresh; old chalan reports stay separate.

### 2.12 Rounding and invariants
- Money `numeric(12,2)`, round half up. Pro-rata revenue splits must be rounded so the Σ of parts equals the exact `amount_received` (the largest allocation absorbs the remainder).
- Global test invariant — at chalan close with all stock depleted, with backup Wallet total counted in:
  `wallet_total + Σ pocket_paid(expenses reimbursed) ... verified as: Σ entitlement_p = wallet_total` (all business deltas — revenue in, expenses/withdrawals/charges out — net to exactly this), see Test A/B in §12.
- Packet remaining can never go below 0; sales, personal use and adjustments must reject otherwise, atomically, inside one transaction with packet rows locked.

---

## 3. Roles and permissions

Two app roles (enum `user_role`): `su_admin` (Sijan), `patabin_admin` (Bappy).

| Capability | `su_admin` | `patabin_admin` |
|---|---|---|
| View everything (dashboard, reports, audit log, both partners' numbers) | yes | yes |
| Create/edit/soft-delete chalan, packing, priority order, sales, personal use, adjustments, expenses, transfers, withdrawals | yes | yes |
| Close / reopen a chalan | yes | yes |
| Change settings (default buy rate, default sell price, default packet size) | yes | no (read-only) |
| Add expense categories | yes | no |
| Create / deactivate users, reset passwords | yes | no |

Rules:
- Public signup is **disabled**. Verify by attempting a signup with the anon key; it must fail.
- Deactivated users (`profiles.is_active = false`) get no data access (enforced in RLS, not only in UI).
- Safeguards re-checked inside the edge function and in the DB: nobody can change their own role; only `su_admin` can modify, deactivate, reset the password of, or change the role of a `su_admin` account; the last active `su_admin` can never be deactivated. All other user management is available to both roles.
- No hard deletes anywhere from the app. Deleting = set `deleted_at`. No DELETE RLS policy on business tables.

---

## 4. Tech stack and repo layout

- **Package manager**: pnpm workspace monorepo (`packageManager` field set, Node 20+ LTS).
- **Web**: React + TypeScript (strict) + Vite + Tailwind CSS v4 (`@tailwindcss/vite`) + React Router + TanStack Query + react-hook-form + zod + `vite-plugin-pwa` + `@supabase/supabase-js` + `@phosphor-icons/react` (light/regular inactive, fill active; named imports) + `@dnd-kit/core` + `@dnd-kit/sortable` for the priority drag & drop. Charts: `recharts` only if needed. Font: Noto Sans Bengali self-hosted via `@fontsource`.
- **Backend**: Supabase cloud (free): Postgres, Auth, one Edge Function. Business logic in Postgres (views, functions, triggers), not in the frontend.
- **Lint/format/test**: ESLint, Prettier, Vitest (shared helpers), SQL tests via `psql`.
- **Deploy**: Vercel, manual (see §11).

```
patabin/
  apps/web/                 # @patabin/web  (React PWA)
  packages/shared/          # @patabin/shared (zod schemas, money + Bangla digit helpers, generated DB types)
  supabase/
    config.toml
    migrations/             # timestamped .sql, forward-only
    functions/manage-users/ # edge function (Deno)
    tests/                  # *.sql tests (BEGIN ... ROLLBACK)
  scripts/                  # seed, db push, types, tests, backup, secrets loader, icon generation (tsx)
  docs/img/                 # generated image assets
  vercel.json               # none at root; apps/web/vercel.json only (§11)
  pnpm-workspace.yaml
  package.json
  SECRETS.md                # gitignored
  SECRETS.example.md
  AGENT.md
  REQUIREMENT.md
  README.md
```

Root scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `test:sql`, `db:link`, `db:push`, `db:types`, `db:seed`, `db:backup`, `check:secrets`.

Git: branch `main`, remote `origin` = `https://github.com/Seizmann/patabin.git` (private). Authenticate with the token from `SECRETS.md` without writing it into `.git/config`.

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
- **Frontend gets only** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL`. Generate `apps/web/.env.local` from `SECRETS.md` (gitignored). Service role key, DB password and access token must never reach the web bundle. CI check: after build, grep `apps/web/dist` for the service role key and the string `service_role`; fail if found.
- `pnpm check:secrets`: fail if `SECRETS.md` or `.env*` is tracked or staged, or if any value from `SECRETS.md` appears in a tracked file.
- Default admin passwords are temporary: both accounts are created with `must_change_password = true`.
- Do not rely on email: Supabase free SMTP is rate-limited. No email confirmation, magic links, or "forgot password" emails. Create users with `email_confirm: true` through the admin API.

---

## 6. Database design (Postgres, `public` schema)

General: `uuid` PK (`gen_random_uuid()`), `created_at`, `updated_at` (trigger), `created_by default auth.uid()`, `deleted_at` on business tables. Money `numeric(12,2)`, quantities `integer >= 0`. Time columns are `timestamptz` (§8 time rules). RLS enabled and forced on every table; `anon` has no access.

| Table | Key columns |
|---|---|
| `profiles` | `id` (= auth.users.id), `role user_role`, `display_name`, `must_change_password bool default true`, `is_active bool default true` |
| `partners` | `id`, `name`, `user_id unique null` |
| `settings` | singleton row: `default_buy_rate default 190`, `default_sell_price default 300`, `default_packet_size default 20`, `updated_by` |
| `expense_categories` | `name` unique; seeded: ট্রান্সপোর্ট, সিগারেট, মোবাইল রিচার্জ, অন্যান্য |
| `chalans` | `code` unique (C-001 …), `purchase_date`, `buy_rate default 190`, `pcs_per_packet default 20`, `status` (`open`/`closed`), `closed_at`, `closed_by`, `note` |
| `chalan_purchases` | `chalan_id`, `partner_id`, `qty > 0`, `amount_paid >= 0` (default `qty × buy_rate`, editable); unique (`chalan_id`,`partner_id`) |
| `packets` | `chalan_id`, `code` (P-01 … unique within chalan), `owner_partner_id`, `total_pcs > 0`, `packed_at` |
| `sell_priority` | `packet_id` PK, `position integer` (continuous renumbering on drag & drop; per open-chalan list) |
| `sales` | `sold_at timestamptz`, `qty > 0`, `list_unit_price`, `amount_received >= 0`, `discount` (generated = `qty × list_unit_price − amount_received`), `customer_name null`, `customer_phone null`, `wallet_account_id NOT NULL`, `note` |
| `sale_allocations` | `sale_id`, `packet_id`, `qty > 0`; PK (`sale_id`,`packet_id`) |
| `personal_uses` | `at timestamptz`, `eater_partner_id`, `packet_id null` (NULL = kept pcs), `qty > 0`, `unit_value`, `note` |
| `stock_adjustments` | `at timestamptz`, `packet_id`, `qty > 0`, `reason` (`gift`/`damage`/`loss`/`sample`/`other`), `person null`, `note` |
| `expenses` | `category_id`, `amount > 0`, `paid_by_partner_id`, `attributed_to_partner_id`, `wallet_account_id null` (NULL = own pocket), `chalan_id null`, `note`, `spent_at timestamptz` |
| `withdrawals` | `at timestamptz`, `partner_id`, `wallet_account_id`, `amount > 0`, `note` |
| `wallets` | `type` (`cash`/`bkash`/`nagad`), `label` (e.g. "Bappy-র বিকাশ"), `is_active bool default true` |
| `wallet_transfers` | `at timestamptz`, `from_wallet_id`, `to_wallet_id` (different wallets), `amount > 0`, `charge numeric default 0`, `attributed_to_partner_id`, `note` |
| `chalan_close_snapshots` | `chalan_id` PK, `closed_at`, `data jsonb` (summary + per-partner figures + wallet balances) |
| `audit_log` | `id bigserial`, `at`, `user_id`, `table_name`, `row_id`, `action` (I/U/D), `old_data`, `new_data` |

Constraints:
- `sales.qty` and allocation qty sum: Σ `sale_allocations.qty` = `sales.qty` (function-enforced, trigger-checked).
- Packet remaining never below 0: enforced inside the allocation functions with row locks.
- Wallet transfers: `from_wallet_id <> to_wallet_id`.
- Cash `type` wallets: at most one active Cash wallet.

### RLS
- Helpers (`SECURITY DEFINER`, `stable`, fixed `search_path`): `is_active_user()`, `is_su_admin()`.
- Active users: SELECT and INSERT/UPDATE on business tables (soft-delete is an UPDATE; delete = set `deleted_at`). No DELETE policies.
- `settings`, `expense_categories` writes, `profiles` writes: `su_admin` only (profile writes also via the edge function).
- `audit_log`: SELECT for active users, no direct writes (written by triggers), append-only (no update/delete grants for anyone).
- Closed-chalan immutability enforced by triggers, not only UI.
- Views use `security_invoker = true`.

### Triggers
- `updated_at` on all tables.
- Audit trigger on every business table (old/new as jsonb).
- Closed-chalan guard on purchases, packets, allocations, sales, personal uses, adjustments, chalan-linked expenses.

### Functions (RPC), atomic and transactional
- `create_chalan(payload jsonb)` — chalan + purchase rows in one call.
- `create_packets(payload jsonb)` — packing session: creates the packet rows for one chalan.
- `set_sell_priority(ordered uuid[])` — renumbers `sell_priority`.
- `create_sale(payload jsonb)`, `update_sale(id, payload jsonb)`, `delete_sale(id)` — allocate by priority (lock packet rows), stock checks, recompute on update/delete.
- `create_personal_use(payload jsonb)`, `create_adjustment(payload jsonb)` — stock check and depletion from a packet (or kept-pcs none for packet NULL).
- `create_expense`, `update_expense`, `delete_expense`, `create_withdrawal`, `create_transfer` — wallet math only, no allocation.
- `close_chalan(id)`, `reopen_chalan(id)` — snapshot + lock.

### Views
- `v_packet_stock` — per packet: owner, total, remaining, priority position.
- `v_chalan_summary` — per chalan totals (bought, sold, kept, gifts, remaining, expenses linked).
- `v_partner_chalan_settlement` — §2.10 figures per chalan per partner.
- `v_partner_balance` — current entitlement per partner (snapshot when closed), `Σ = wallet_total`.
- `v_wallet_balance` — per wallet: inflow, outflow, charge, current balance.
- `v_sales_enriched` — sale + allocations + packet codes + owners + customer + discount %.
- `v_dashboard_totals` — stock, today/month sales, income, discount, wallet balances.

### Seed (idempotent, `scripts/seed`)
- `settings` row (190 / 300 / 20); expense categories; two `partners` (names from `SECRETS.md`); the two auth users + `profiles` (`su_admin` for `SU_ADMIN_*`, `patabin_admin` for `PATABIN_ADMIN_*`, `must_change_password = true`), linked to their partner rows; wallets: one `cash` wallet plus label-less bkash/nagad none (users add MFS accounts in the UI).

---

## 7. Edge function: `manage-users`

- Deno, `verify_jwt = true`. Reads the caller from the JWT, checks `profiles.role = 'su_admin'` and `is_active`; otherwise 403.
- Uses the injected service role env var for admin API calls.
- Actions: `create_user` (email, temp password, display_name, role, optional partner link), `reset_password` (temp password + `must_change_password = true`), `set_active` (activate/deactivate).
- Proper CORS (from an `ALLOWED_ORIGINS` function secret, localhost dev only, never wildcard) and JSON errors, generic messages, no secret or password logging. Deploy with `supabase functions deploy manage-users`.
- Recovery if su_admin is locked out: `pnpm admin:reset` script (service role, from `SECRETS.md`).

Auth config (via `supabase/config.toml` + `supabase config push`, or the Management API): signups disabled, email confirmations off, minimum password length 10, Site URL set to the Vercel production URL once known.

---

## 8. Frontend (Bangla, mobile-first)

General:
- All strings in `apps/web/src/i18n/bn.ts` (no hardcoded UI text in components).
- Money and dates: Bangla digits and lakh grouping (`Intl.NumberFormat('bn-BD')`), ৳, dates in `Asia/Dhaka`. **Inputs accept both Bangla and English digits** (normalise on input; `type="text" inputMode="decimal"`).
- Bottom tab bar on mobile with 6 icon-only tabs (`@phosphor-icons/react` outline; fill when active; Bangla `aria-label`s): হোম, বিক্রি, প্যাকেট, খরচ, হিসাব, আরও. "আরও" opens a sheet with: রিপোর্ট, চালান, ব্যক্তিগত ব্যবহার, নষ্ট/ফ্রি, ওয়ালেট, পরিবর্তনের ইতিহাস, ব্যবহারকারী (su_admin only), সেটিংস (su_admin only), প্রোফাইল, লগআউট.
- Every list is searchable/filterable by date; empty, loading (skeletons, no layout shift) and error states in Bangla.
- Never optimistic-update money values; refetch after write.
- Route-level code splitting; charts lazy-load.
- The only allowed symbol besides icons is the taka sign. Absolutely no emoji or unicode pictographs anywhere (UI, code, docs, commits, seed data).

**Time (Bangladesh time):**
- Every entry defaults to `now()` from the database server clock, displayed in `Asia/Dhaka`. The device clock is never trusted for defaults.
- Every entry form has a compact time control showing the current server time with the option to pick a custom date and time manually (Bangla, mobile friendly). Unchanged control = server default.
- Reports/dashboards: today, yesterday, this week, this month, last month, custom range; boundaries computed in `Asia/Dhaka`, custom datetimes carry an explicit `+06:00` offset, never device timezone parsing.

### Pages

1. **লগইন**, then forced **পাসওয়ার্ড পরিবর্তন** while `must_change_password` is true. While the flag is true the DB blocks all writes except the password change itself; the flag clears only via a real password change.
2. **হোম**:
   - Stock left (open chalans), today/month sales, income, discount total, profit indicator.
   - **Per-partner account cards**: Sijan's own balance and Bappy's own balance (from `v_partner_balance`), each also showing his remaining packet pcs.
   - **Shared wallet balances**: Cash, each bKash/Nagad account.
   - Settlement sentence ("X কে Y ৳Z দেবে") when balances are opposed.
   - Quick buttons: নতুন বিক্রি, ব্যক্তিগত ব্যবহার.
3. **বিক্রি (new sale)**: qty stepper; amount auto-fills `qty × price`, editable; live discount (৳ and %); customer name + phone (optional autocomplete from previous entries); wallet + specific MFS account selection (mandatory); app shows which packets the pcs will come from (packet numbers + owners) per the priority order; save in ~3 taps; stock-insufficient error in Bangla.
4. **বিক্রির তালিকা**: filter by date/customer/kind/packet; edit and soft-delete with confirmation; per-sale detail shows allocations (packet codes + owners).
5. **প্যাকেট**: packet grid/list per chalan showing owner, code, total, remaining; **drag & drop priority list** (`@dnd-kit`, mobile-first touch targets) with a visible order indicator; save priority via `set_sell_priority`; state where packing happens too (নতুন প্যাকেট বাটন: choose pcs per packet, creates packets for the owner partition of the chalan).
6. **ব্যক্তিগত ব্যবহার**: eater (defaults to logged-in partner), qty, source = own kept pcs OR choose packet (any owner); amount defaults to `qty × sell price` (editable); from another's packet shows the "যাকে দিতে হবে" hint.
7. **নষ্ট/ক্ষতি/ফ্রি**: adjustment entry: packet picker (owner shown), qty, reason, person (for gifts), note.
8. **খরচ**: add/list; fields → category, amount, কে দিল (paid_by), কার খরচ (attributed_to) with a clear helper line ("বাপ্পির রিচার্জ = বাপ্পির খরচ"), wallet (না = নিজের পকেট), optional chalan link; list filterable by partner/category/date.
9. **চালান**: list with status chip; **নতুন চালান** form (date, buy rate, per-partner qty + amount paid auto from `qty × buy_rate` editable); chalan detail: purchases, packets, sales, personal uses, adjustments, expenses, summary numbers, per-partner entitlement, **বন্ধ করুন / আবার খুলুন**; close blocked while stock remains (with a hint where the pcs are).
10. **ওয়ালেট**: balance cards for Cash + every bKash/Nagad account; **ট্রান্সফার ফর্ম**: from, to, amount, cashout charge field shown automatically when `from` is MFS and `to` is Cash (Cash→MFS locks charge at 0 with a note), attributed partner; transfer history; create/deactivate bKash/Nagad accounts (Cash wallet single).
11. **হিসাব মেটানো**: per-partner entitlement breakdown (capital, profit, consumption, expenses, withdrawals), settlement sentences, marked-settled state per chalan at close; transfer history.
12. **রিপোর্ট**: chalan-wise and partner-wise reports, date range, CSV export.
13. **পরিবর্তনের ইতিহাস** (audit log viewer).
14. **ব্যবহারকারী** (su_admin only): create, reset password, activate/deactivate.
15. **সেটিংস** (su_admin only, `patabin_admin` read-only): default buy rate, default sell price, default packet size; expense categories management (su_admin adds).

Route guards by role and `is_active`. Role is read from `profiles`, never trusted from the client.

Glossary (use consistently): chalan = চালান, packet = প্যাকেট, sale = বিক্রি, discount = ছাড়, personal use = ব্যক্তিগত ব্যবহার, gift = ফ্রি, stock = স্টক, expense = খরচ, profit = লাভ, capital = পুঁজি, payout = প্রাপ্য, balance = পাওনা/দেনা, settlement = হিসাব মেটানো, wallet = ওয়ালেট, withdrawal = উত্তোলন.

Design language (light mode only — no dark mode, no `dark:` classes, `color-scheme: light`; warm off-white `#F5F1EA` background, white cards radius 24px with 1px soft warm border, generous padding; stat cards: tiny uppercase muted label + large semibold ৳ number in Bangla digits; positive muted green `#2F6B4F`, negative muted red `#B4723F`; hero card with photo and dark gradient overlay; mobile: fixed bottom bar with safe-area padding; desktop ≥1024px: bottom bar becomes a left sidebar with icon + Bangla labels, content centered max ~1200px, stat cards 4-up, lists become tables, forms open in side panels/dialogs; responsive hard rule: every page works at 360px, 768px and ≥1280px with no horizontal scroll, touch targets ≥44px, no hover-only interactions). Image assets and generation prompts: `docs/image-prompt.md`; icons derived from `logo-mark.png` via a `sharp` script (192, 512, maskable, apple-touch 180, favicon). `apps/web/index.html` includes title, `theme-color` `#F5F1EA`, OG/Twitter meta with `og-image.webp` 1200x630 absolute URL, WebApplication JSON-LD.

**SEO**: dynamic titles per route (`<Page> · PataBin`), one hook; meta description per main route; canonical from `VITE_SITE_URL`; meta robots `noindex, nofollow` + restrictive `robots.txt`; a test fails if the rewrite list and the router config drift apart.

**Security hardening recap**: RLS enabled and forced on every table; no grants to `anon`; default privileges revoked; `execute` granted only to `authenticated`; every `SECURITY DEFINER` function has fixed `search_path`, validates inputs, no dynamic SQL, re-checks caller role and `is_active`; audit log append-only; frontend has no `dangerouslySetInnerHTML`, no secrets in the bundle (build-time grep), no user data in `localStorage` beyond the Supabase session, never caches API responses in the service worker; `pnpm audit` has no high/critical findings; lockfile committed; `SECRETS.md`/`.env*` never tracked; idle sign-out after 60 minutes of inactivity.

---

## 9. PWA

- `vite-plugin-pwa`, `registerType: 'autoUpdate'`, manifest: name "PataBin", short_name "PataBin", `lang: 'bn'`, `display: 'standalone'`, `start_url: '/'`, theme/background colours, icons 192/512 + maskable.
- Cache only the app shell and static assets. **Never cache Supabase API responses.**
- When offline: show a Bangla banner and disable save buttons (no offline writes).
- Must pass the installability check in Chrome (Lighthouse PWA/installable).

---

## 10. Quality bar

- TypeScript strict, no `any` in app code, DB types generated into `packages/shared` (`supabase gen types typescript --linked`).
- zod validation on all forms, mirrored by DB constraints.
- Accessible labels, sensible contrast, works at 360px width.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all green.
- Shortest readable code; no comments in code (TS/SQL/CSS/config), no docstrings, no TODOs, no `console.log` in committed code.

---

## 11. Deployment (Vercel, manual)

- `vercel.json` lives ONLY at `apps/web/` (no root config). The human sets the Vercel project Root Directory to `apps/web` and deploys manually; no Vercel CLI commands are run by the agent.
- `apps/web/vercel.json` defines: `framework: vite`; install/build commands that work with Root Directory `apps/web` in this pnpm workspace (`@patabin/shared` resolves via the workspace lockfile); output `dist`; an explicit rewrite to `/index.html` for EVERY app route, then one catch-all so the in-app 404 renders; cache headers (immutable hashed assets; no-cache for service worker, `registerSW.js`, manifest); security headers: strict CSP (`script-src 'self'`, no unsafe-eval; `connect-src` only the app's Supabase https origin + wss twin; `img-src self data blob`; self-hosted fonts; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (deny camera/microphone/geolocation/payment), `Cross-Origin-Opener-Policy`, `X-Robots-Tag: noindex, nofollow`.
- `docs/DEPLOY.md` documents: exact project settings, env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL`), Supabase Auth Site URL step, first-login steps, backup command.
- Set the Supabase Auth Site URL to the production URL. Open the production URL and verify login, a sale, a chalan, packet priority and the PWA manifest.

---

## 12. Testing and acceptance (must all pass)

SQL tests in `supabase/tests/*.sql`, each wrapped in `BEGIN; ... ROLLBACK;`, using `DO $$ ... ASSERT ... $$`, run by `pnpm test:sql` via `psql` with `SUPABASE_DB_URL`.

**Test A — core numbers (own-stock).** Chalan: `buy_rate` 190. Bappy buys 220 pcs (paid 41,800 own pocket), Sijan 100 pcs (paid 19,000 own pocket). Personal kept: Bappy 20, Sijan 20. Packing: Bappy 200 (10 packets × 20), Sijan 80 (4 × 20). Sales: external 275 pcs received 82,250 (list 300) and 5 pcs received 1,450 (list 1500 → discount 50); total external revenue 83,950; no expenses, no withdrawals.
Expected: ext_rev Bappy = 83,950 × 200/280 = **59,964.29**, Sijan = **23,985.71**; pcs_out Bappy 220, Sijan 100; profit Bappy = 59,964.29 − 41,800 = 18,164.29; entitlement Bappy = **59,964.29**, Sijan = **23,985.71**; Σ = 83,950 = wallet total (only Cash wallet used). Chalan closes (stock 0).

**Test B — personal use, expenses, reimbursements.** Same chalan, but sales: external 270 pcs received 81,000 (no discount); Sijan eats 10 pcs from one of Bappy's packets (`unit_value` 300 → internal revenue 3,000 to Bappy); expense "Bappy-র রিচার্জ" 200, paid_by Sijan, wallet NULL, attributed_to Bappy; expected: profit Bappy = 57,857.14 − 41,800 + 3,000 = 19,057.14; entitlement Bappy = 41,800 + 19,057.14 − 200 = 60,657.14; entitlement Sijan = 19,000 + (23,142.86 − 19,000) − 3,000 + 200 = 20,342.86; Σ = **81,000.00** = wallet total. Close succeeds (Sijan kept 20 + ate 10; Bappy kept 20).

**Test C — priority allocation.** One open chalan, packets in priority order: P-01 (Bappy, 20), P-02 (Sijan, 20), P-03 (Bappy, 20). Sale of 25 pcs → allocations P-01:20, P-02:5; revenue split 20/25 and 5/25 of `amount_received`; the sale's detail shows both packet codes and owners. Sale of 100 pcs with only 60 in stock → rejected, no rows left.

**Other required checks:**
- Priority renumbering via `set_sell_priority` persists and drives the next sale's consumption order.
- Personal use from another's packet credits the owner and debits the eater at `unit_value`; from own packet, no balance movement; packet remaining decrements in both cases; kept pcs (packet NULL) never touch packets.
- Gift/adjustment from a packet decrements remaining and bills the owner `buy_rate × qty`.
- Transfer MFS→Cash with charge 20: bkash −1,000, cash +980, charge 20 visible and debited to the attributed partner; Cash→MFS transfers force charge 0.
- Withdrawal: wallet decreases, that partner's entitlement decreases.
- Soft delete of a sale restores stock and balances; audit rows exist for insert, update and delete.
- Closed chalan: new allocation, purchase/packet/sale/personal/adjustment/chalan-expense edits are rejected; `close_chalan` fails while stock remains; reopen works for both roles and is audited.
- Open-chalan invariant: for every state, `Σ entitlement_p = wallet_total + Σ (own-pocket expenses not yet reimbursed is zero by construction) − Σ (own-pocket expense amounts)` holds i.e. any own-pocket-paid expense makes the pool owe that amount back to the payer; wallets never go negative.
- RLS: `anon` reads nothing; deactivated user reads nothing; `patabin_admin` cannot call `manage-users`, change settings, add expense categories.
- Signup with the anon key fails.
- Frontend Vitest: money rounding (pro-rata remainder), Bangla/English digit normalisation, discount calculation, priority-list drag & drop reordering logic.
- `pnpm check:secrets` and the bundle grep (§5) pass.
- Production smoke test on the Vercel URL (§11).

---

## 13. Build order (commit and push after each phase)

1. Monorepo scaffold check/update, `.gitignore` (incl. `SECRETS.md`, `.env*`, `backups/`), `check:secrets`.
2. Model pivot (§15): backup DB, migrate schema to revision-2 tables, RLS, triggers, functions, views; `db push`; regenerate types.
3. SQL tests A–C and the other checks; fix until green.
4. Seed script and auth config (signups off).
5. Edge function `manage-users` — verify existing deploy still matches the spec; redeploy if needed.
6. Web app foundation: auth, guards, Bangla i18n, layout, forced password change.
7. Feature pages in the order of §8: চালান → প্যাকেট + priority → বিক্রি → ব্যক্তিগত/ফ্রি → খরচ → ওয়ালেট → হিসাব → হোম → রিপোর্ট.
8. PWA, SEO, meta, icons.
9. `apps/web/vercel.json` check against the router; docs/DEPLOY.md; production verification.
10. `db:backup` script (JSON export of all business tables via service role into gitignored `backups/`), README (setup, scripts, role matrix, how to reset su_admin password, free-tier pause note), final full test run.

---

## 14. Out of scope (do not build)

Credit sales / customer dues, offline write queue, multiple products or price lists, automatic discount tiers, email or SMS flows, English UI, a separate customers table (name+phone live on sales), native apps, payment gateways or automatic bKash/Nagad verification, packet repack/merge operations, shared profit-percentage splitting (replaced by own-stock), carrying stock value into a new chalan's cost.

---

## 15. Revision-2 pivot and migration notes

- The v1 schema (batches, contributions, FIFO across batches, payout by contribution %) and its views/functions/tests are superseded.
- Before replacing anything: run `db:backup`, then ask the user to confirm the database holds no data that must be preserved. Only after confirmation apply the migration that drops/renames v1 objects and creates the revision-2 schema as fresh migrations. Never touch `SECRETS.md`.
- Keep `docs/img/`, PWA assets, deployment config, and security hardening from the previous implementation wherever they are still valid.
