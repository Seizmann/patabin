<div align="center">

<img src="https://capsule-render.vercel.app/api?type=venom&color=0:4a2c12,50:8b5a2b,100:d2a679&height=150&section=header&text=Security%20Policy&fontSize=48&fontColor=fff8f0&fontAlignY=38&desc=PataBin%20%C2%B7%20Responsible%20Disclosure&descSize=16&descAlignY=60&descColor=f3e3cf&animation=blinking" width="100%" />

# 🔒 Security Policy

**PataBin** takes the security of its users' financial data seriously.
This document describes how to report vulnerabilities and what to expect.

</div>

---

## 🛡️ Supported versions

PataBin is a continuously deployed application — there are no versioned releases.
Only the **latest deployment** at [patabin.vabobd.top](https://patabin.vabobd.top) is supported with security fixes.

| Deployment | Supported |
| --- | --- |
| `main` (production) | ✅ |
| Older builds / forks | ❌ |

---

## 🎯 Scope

**In scope:**

- Authentication & session handling (Supabase Auth flows, password gates, idle sign-out)
- Authorization gaps — anything a `patabin_admin` / `patabin_partner` / demo account can do that it shouldn't (RLS or RPC bypass)
- Injection vulnerabilities (SQL, XSS, command injection)
- Business-logic flaws in the accounting engine (settlement, allocation, balances) that corrupt or leak financial data
- Secrets leakage in the repository or the deployed app

**Out of scope:**

- Volumetric denial-of-service (DoS/DDoS)
- Social engineering of the operator or users
- Spam or content injection through normal app features
- Issues in third-party services (Supabase, Vercel) — report those upstream
- The public **Demo Admin** account being read-only-broken *only in the UI* — demo writes are intentionally faked in memory; only a write that reaches real data counts

---

## 📬 Reporting a vulnerability

> ⚠️ **Please do not open a public GitHub issue for security reports.**

1. **Preferred:** open a private [GitHub Security Advisory](https://github.com/Seizmann/patabin/security/advisories/new) on this repository.
2. **Alternative:** contact the maintainer through **[sijan.pro.bd](https://sijan.pro.bd)**.

Include as much of the following as you can:

- A clear description of the issue and its impact
- Step-by-step reproduction (URLs, account role used, request payloads)
- Screenshots or proof-of-concept code
- Your assessment of severity and any suggested fix

You will receive an acknowledgment within **48 hours** and a status update at least every **7 days** until the issue is resolved.

---

## ⏱️ Disclosure policy

1. **Triage** — the report is confirmed and severity is assessed.
2. **Fix** — a patch is developed and deployed to production.
3. **Disclosure** — after the fix ships, the advisory is published with credit to the reporter (unless anonymity is requested).

We ask that you give us a reasonable window (**90 days**) to fix issues before any public disclosure, and that you:

- Do not access, modify, or exfiltrate real business data beyond what's needed to prove the vulnerability
- Do not run automated scanners at a volume that degrades the service
- Do not test against the demo account in ways that affect real users

---

## 🧰 Security architecture (quick reference)

For reviewers and auditors, the security-relevant pieces of PataBin:

- **Row-Level Security** — every table is protected by RLS; read access is open to active authenticated users, writes are gated by `can_write()` + module permissions
- **RPC guards** — all writes go through `security definer` RPCs that validate permissions, open-chalan state, and input integrity server-side
- **Demo isolation** — `patabin_demo_admin` accounts are redirected to an in-memory demo dataset; the database additionally rejects demo writes
- **Role hierarchy** — `su_admin` > `patabin_admin` > `patabin_partner` (read-only investor) > `patabin_demo_admin` (sandbox)
- **Secrets hygiene** — secrets live in a git-ignored `SECRETS.md`; `pnpm check:secrets` fails CI if anything sensitive is committed

---

## 📜 License

This security policy is part of PataBin, released under the [MIT License](./LICENSE).

Copyright © 2026 **Mohammad Sijan** ([sijan.pro.bd](https://sijan.pro.bd)) · **SpritexAI** ([spritexai.pro.bd](https://spritexai.pro.bd))

---

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:d2a679,50:8b5a2b,100:4a2c12&height=100&section=footer&text=Stay%20safe%20%C2%B7%20Report%20responsibly&fontSize=20&fontColor=fff8f0&fontAlignY=65&descColor=f3e3cf&stroke=d2a679&strokeWidth=2" width="100%" />
