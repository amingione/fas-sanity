# AGENTS.md — fas-sanity

**This file is the authoritative architecture reference for fas-sanity.**
If any other document in this repo conflicts with this file, this file wins.

---

## Repo Role

fas-sanity is the **content layer** of the FAS 4-repo commerce pipeline.

```
Sanity (content) → Medusa (commerce) → fas-cms-fresh (storefront) + fas-dash (ops) → Stripe/Shippo via Medusa
```

## Local Repo Paths

- fas-sanity: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-sanity
- fas-medusa: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa
- fas-cms-fresh: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-cms-fresh
- fas-dash: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-dash

fas-cms-fresh and fas-cms refer to the same codebase.

---

## System Authorities

| Concern                                                   | Authority              |
| --------------------------------------------------------- | ---------------------- |
| Products, variants, pricing, inventory, shipping profiles | Medusa                 |
| Cart, checkout, orders, customers, shipping logic         | Medusa                 |
| Payments                                                  | Stripe via Medusa only |
| Shipping labels and rates                                 | Shippo via Medusa only |
| Refunds and returns                                       | Medusa only            |
| Content, SEO, media, campaigns, editorial pages           | Sanity                 |
| Vendor CRM metadata (non-transactional)                   | Sanity                 |
| Customer storefront UI                                    | fas-cms-fresh          |
| Employee operations console                               | fas-dash               |

---

## Non-Negotiable Rules

1. Sanity is content-only and non-transactional.
2. All schema `integration` group fields are `readOnly: true`. Never write prices, stock, or order state from app code.
3. fas-cms-fresh is storefront UI and API consumer only — no commerce authority.
4. fas-dash is ops console and API consumer only — no commerce authority.
5. Medusa is the only commerce authority.
6. Direct Stripe or Shippo usage outside Medusa is prohibited.
7. No duplicate authority for prices, inventory, order state, shipping state, or refunds.
8. Legacy Netlify commerce functions are 410 GONE — do not restore or expand them.

---

## Cross-Repo Symlink Registry

**fas-sanity is the canonical source for all shared governance and architecture docs.**
The following files exist as real files ONLY in fas-sanity. In fas-medusa, fas-dash, and fas-cms-fresh they are **symlinks** — any write to those paths writes through to fas-sanity. Never create a regular file at these paths in any other repo.

| Symlinked path (in fas-medusa / fas-dash / fas-cms-fresh)     | Edit here in fas-sanity                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `docs/governance/RELEASE_CHECKLIST.md`                        | `docs/governance/RELEASE_CHECKLIST.md`                        |
| `docs/governance/FAS_4_REPO_PIPELINE_TASK_TRACKER.md`         | `docs/governance/FAS_4_REPO_PIPELINE_TASK_TRACKER.md`         |
| `docs/architecture/canonical-commerce-architecture.md`        | `docs/architecture/canonical-commerce-architecture.md`        |
| `docs/architecture/migration-status.md`                       | `docs/architecture/migration-status.md`                       |
| `docs/architecture/schema-authority-checklist.yml`            | `docs/architecture/schema-authority-checklist.yml`            |
| `docs/ai-governance.md`                                       | `docs/ai-governance.md`                                       |
| `docs/ai-governance/AI_TASK_RUNBOOK.MD`                       | `docs/ai-governance/AI_TASK_RUNBOOK.MD`                       |
| `docs/ai-governance/GOVERNANCE_MAKE_COMMANDS.md`              | `docs/ai-governance/GOVERNANCE_MAKE_COMMANDS.md`              |
| `docs/ai-governance/HOW_WE_FIX_BUGS.md`                       | `docs/ai-governance/HOW_WE_FIX_BUGS.md`                       |
| `docs/ai-governance/Makefile.template`                        | `docs/ai-governance/Makefile.template`                        |
| `docs/ai-governance/PROD_IDENTIFICATION_RULES.md`             | `docs/ai-governance/PROD_IDENTIFICATION_RULES.md`             |
| `docs/ai-governance/System_Architecture_And_API_Reference.md` | `docs/ai-governance/System_Architecture_And_API_Reference.md` |
| `docs/ai-governance/ai-governance.md`                         | `docs/ai-governance/ai-governance.md`                         |
| `docs/ai-governance/contracts/` *(entire directory)*          | `docs/ai-governance/contracts/`                               |
| `docs/ai-governance/guards/` *(entire directory)*             | `docs/ai-governance/guards/`                                  |
| `docs/ai-governance/templates/` *(entire directory)*          | `docs/ai-governance/templates/`                               |
| `docs/system/SANITY_MEDUSA_CONTRACT.md`                       | `docs/system/SANITY_MEDUSA_CONTRACT.md`                       |
| `docs/governance/DOTENVX/` *(entire directory)*               | `docs/governance/DOTENVX/`                                    |

**NOT symlinked (repo-specific):**
- `docs/governance/REPO_GOVERNANCE.md` — different per repo
- `docs/ai-governance/skills/` — each repo has different agent skill files
- `AGENTS.md` (this file) — different per repo

---

## Execution Tracker

Canonical tracker: `docs/governance/FAS_4_REPO_PIPELINE_TASK_TRACKER.md`

All architecture, migration, and governance work maps to tracker workstream items.

---

## Pipeline Status (2026-04-02)

All 6 workstreams closed or in-progress with clean authority boundaries:
- No direct Stripe SDK in fas-sanity
- No direct Shippo SDK in fas-sanity
- All integration group fields readOnly verified
- Legacy checkout Netlify functions: 410 GONE
- One-time migration scripts moved to scripts/archive/
- Governance docs cleaned and archived
