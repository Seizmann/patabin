<img src="https://capsule-render.vercel.app/api?type=venom&color=0:4a2c12,50:8b5a2b,100:d2a679&height=200&section=header&text=PataBin&fontSize=68&fontColor=fff8f0&fontAlignY=33&desc=Bookkeeping%20for%20chocolate%20resale&descSize=18&descAlignY=57&descColor=f3e3cf&animation=blinking" width="100%" />

<div align="center">

<img src="docs/img/logo-mark.png" alt="PataBin logo" width="110" />

<br />

<img src="https://readme-typing-svg.demolab.com?font=Noto+Sans+Bengali:wght@600&size=24&duration=2600&pause=1100&color=C07343&center=true&vCenter=true&multiline=false&repeat=true&width=780&height=52&lines=Stock+%C2%B7+Sales+%C2%B7+Partner+balances;Break+bulk+into+packets%2C+sell+piece+by+piece;Own-stock+model+%E2%80%94+clear+partner+balances;Installable+PWA+%E2%80%94+works+offline" alt="Animated tagline" />

<br />

[![License: MIT — Mohammad Sijan · SpritexAI](https://img.shields.io/badge/License-MIT%20%7C%20Mohammad%20Sijan%20%C2%B7%20SpritexAI-8b5a2b?style=for-the-badge&logo=openaccessinitiative&logoColor=white&labelColor=4a2c12)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![PWA](https://img.shields.io/badge/Installable-PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220?style=for-the-badge&logo=pnpm&logoColor=white)](https://pnpm.io/)

<br />

[![Live App](https://img.shields.io/badge/%F0%9F%8C%90_Live_App-patabin.vabobd.top-8b5a2b?style=for-the-badge)](https://patabin.vabobd.top)

</div>

---

## 🌐 Try the live demo

The production app is live at **[patabin.vabobd.top](https://patabin.vabobd.top)** — installable as a PWA on any phone.

Want to look around without touching real business data? Log in with the public **Demo Admin** account. It serves a complete set of realistic dummy data (chalans, packets, sales, customers, wallets, expenses, reports) and is strictly read-only — every write is rejected in the UI and at the database level.

> **Live app:** https://patabin.vabobd.top
>
> | | |
> | --- | --- |
> | **Email** | `demo@patabin.rexio.pro` |
> | **Password** | `demo1234` |

---

## 🍫 What it does

PataBin is a mobile-first PWA built for partners who buy chocolates in bulk, break them into packets, and resell piece by piece. The business runs in independent purchase lots (*chalans*): each lot is entered, settled, and closed — then the next one starts fresh.

| &nbsp; | &nbsp; |
| --- | --- |
| 💰 **Own-stock model** | Each partner pays for their own pieces from their own pocket. Whatever sells from a partner's packet — revenue and profit — belongs to that partner. |
| 📊 **Clear balances** | Per-partner balances ("who gets what from the cash pool") alongside shared wallet balances, with a full per-chalan settlement view. |
| 🧾 **Price snapshots** | Sales capture the listed sell price, the free-form final amount, and the derived discount — every entry stays auditable. |
| 👤 **Per-user view modes** | Every user can switch the whole app between the full workspace view and a personal *self mode* that shows only their own sales, expenses, investment, stock, and balances. |

<img src="docs/img/dashboard-hero.webp" alt="PataBin dashboard" width="100%" />

---

## ✨ Features

| Area | What's inside |
| --- | --- |
| 🚚 **Chalans** | Bulk purchase entry with per-partner buy rows, buy rate, and editable packet size |
| 📦 **Packets** | Packing sessions, drag & drop sell-priority list (`@dnd-kit`), packet codes like `C-001/P-01` |
| 🧮 **Sales** | Auto-allocated across packets in priority order, pro-rata revenue split between owners |
| 🍽️ **Personal use** | Eating from another partner's packet records an internal credit to the owner |
| 🔁 **Stock adjustments** | Gifts, damage, loss, samples — traceable with person and note |
| 💸 **Expenses & withdrawals** | Category-managed records with manual attribution and optional chalan link |
| 👛 **Wallets** | Shared wallet accounts with per-partner and shared balances, payments received live |
| 🧑‍💼 **Administration** | `su_admin` settings, user management, and DB-driven module permissions |
| 👁️ **Investor role** | `patabin_partner` accounts see every balance, report, and audit trail — but can't write anything |
| 🎭 **Demo role** | `patabin_demo_admin` is a read-only public demo account: the app serves dummy data instead of real records, enforced both client-side and in Postgres (RLS + RPC guards) |

**Read-only is enforced in the database (RLS + RPC guards), not just hidden in the UI.**

<div align="center">

**Every state, designed — even the empty ones.**

<br />

<img src="docs/img/empty-sales.png" alt="Empty sales state" width="32%" />
<img src="docs/img/empty-expenses.png" alt="Empty expenses state" width="32%" />
<img src="docs/img/empty-settlements.png" alt="Empty settlements state" width="32%" />

</div>

---

## 🛠️ Tech stack

<div align="center">

**Frontend** &nbsp;
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![React Router](https://img.shields.io/badge/React_Router-7-CA4245?logo=reactrouter&logoColor=white)

**Backend & Infra** &nbsp;
![Supabase](https://img.shields.io/badge/Supabase-Postgres_+_Auth_+_RLS-3FCF8E?logo=supabase&logoColor=white)
![PWA](https://img.shields.io/badge/vite--plugin--pwa-Workbox-5A0FC8?logo=pwa&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-workspaces-F69220?logo=pnpm&logoColor=white)

</div>

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, React Router
- **Backend:** Supabase (Postgres, row-level security, generated schemas, edge functions)
- **PWA:** `vite-plugin-pwa` with Workbox — offline shell and installable app
- **Monorepo:** pnpm workspaces (`apps/web`, `packages/shared`, `supabase`)

---

## 📂 Project structure

```text
patabin/
├── apps/web/          # React PWA (UI, features, routes)
├── packages/shared/   # Shared types & Supabase-generated DB types
├── supabase/          # Migrations, functions, and labels (labels: config push)
├── scripts/           # Seed, backup, env, icon and config generators
└── docs/              # Production docs
```

---

## 🚀 Getting started

Prerequisites: **Node ≥ 20**, **pnpm 11**, and [Supabase CLI](https://supabase.com/docs/guides/local-cli).

```bash
# 1. Install dependencies
pnpm install

# 2. Local dev runtime (reads SECRETS.md, writes .env for the web app)
pnpm dev

# 3. Quality checks
pnpm lint
pnpm typecheck
pnpm test

# 4. Production build
pnpm build
```

> 🔐 Secrets live in `SECRETS.md` at the repo root — never commit it. Use `SECRETS.example.md` as the key reference. Secrets hygiene is enforced by `pnpm check:secrets`.

---

## 🧰 Useful scripts

| Command | Purpose |
| --- | --- |
| `pnpm db:link` / `pnpm db:push` | Link the Supabase project and apply migrations |
| `pnpm db:types` | Regenerate typed database schemas in `packages/shared` |
| `pnpm db:seed` / `pnpm db:backup` | Seed the cloud project / back up its tables |
| `pnpm gen:icons` | Regenerate PWA icons and brand assets with `sharp` |
| `pnpm gen:vercel` | Generate `apps/web/vercel.json` (headers, routes, caching) |
| `pnpm test:sql` / `pnpm check:routes` | SQL smoke tests / route integrity checks |

---

## 🔒 Security

Found a vulnerability? Please **do not open a public issue**. Read [SECURITY.md](./SECURITY.md) for how to report it responsibly, what's in scope, and how disclosures are handled.

---

## 📚 Requirements & docs

The full product spec — domain model, accounting rules, agent workflow, and definition of done — lives in [REQUIREMENT.md](./REQUIREMENT.md). Production notes and operational guides are in [docs/](./docs/).

---

## 📜 License

Released under the **MIT License** — free to use, modify, and distribute.

Copyright © 2026 **Mohammad Sijan** ([sijan.pro.bd](https://sijan.pro.bd)) · **SpritexAI** ([spritexai.pro.bd](https://spritexai.pro.bd))

See [LICENSE](./LICENSE) for the full text.

---

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:d2a679,50:8b5a2b,100:4a2c12&height=130&section=footer&text=Mohammad%20Sijan%20%C2%B7%20SpritexAI&fontSize=24&fontColor=fff8f0&fontAlignY=62&desc=sijan.pro.bd%20%C2%B7%20spritexai.pro.bd&descSize=13&descAlignY=82&descColor=f3e3cf&stroke=d2a679&strokeWidth=2&animation=twinkling" width="100%" />
