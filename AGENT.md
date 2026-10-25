# PataBin — Agent Rules

## Coding style (most important)

- Write code as short as possible: fewest lines and tokens that stay readable. Prefer concise idioms, early returns, small functions. No needless abstractions, no speculative generality, no dead code, no unused exports.
- **Do NOT add comments to code.** No inline comments, no JSDoc/docstrings, no section banners, no TODOs. A comment is allowed only when it is very important and the code cannot express it (a non-obvious hidden constraint or a workaround for a real bug). This applies to SQL, TypeScript, CSS and config files too.
- No `console.log` left in committed code.

## Project rules

- `REQUIREMENT.md` is the source of truth; read it before any work.
- Never read, print, log or commit `SECRETS.md` values. It exists only for the human.
- Never run destructive commands on the live DB (see `REQUIREMENT.md` §0).
- Never force-push.
- All UI strings go through `apps/web/src/i18n/bn.ts`.
- TypeScript strict everywhere.

## Design direction

- Light mode only. No dark mode, no `dark:` classes, `color-scheme: light`. Premium, calm, editorial.
- Warm off-white page background (`#F5F1EA`); white cards, 24px radius, 1px soft warm border, almost no shadow, generous padding.
- Mobile-first and fully responsive: must work at 360px, 768px and ≥1280px, no horizontal scroll, touch targets ≥44px, no hover-only interactions.
- Mobile: fixed bottom nav with exactly 6 icon-only tabs (outline icons, muted grey inactive, espresso/cocoa active with a small indicator).
- Desktop (≥1024px): bottom bar becomes a left sidebar with icon + Bangla label items; content in a centered container (~1200px max), stat cards 4-up, lists become tables, forms open in a side panel or dialog.
- Use assets `login-bg`, `404-bg`, `dashboard-hero`, `empty-*`, `offline`, `app-texture`, `logo-mark`, `wordmark` (see `docs/image-prompt.md` for paths and specs). Generated images are staged in `docs/img/`; copy them to the final paths in `docs/image-prompt.md`, never edit the originals.

## Workflow

- Commit after each phase with conventional commits (`feat:`, `fix:`, `chore:`).
- Run lint, typecheck and tests before committing once they exist.
