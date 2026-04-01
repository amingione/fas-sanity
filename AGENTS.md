refer to:

> codex.md & AI_GUIDELINES.md
> Access to all FAS repositories is allowed: fas-sanity, fas-medusa, fas-cms-fresh, fas-dash.
> fas-cms-fresh and fas-cms refer to the same codebase.

Local paths:

- fas-sanity: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-sanity
- fas-medusa: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa
- fas-cms-fresh: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-cms-fresh
- fas-dash: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-dash

AGENTS.md is the authoritative architecture reference for commerce responsibilities across all FAS repositories.

# FAS 4-Repo Architecture (Authoritative)

If any other document conflicts with this file, this file wins.

## System Authorities

| Concern | System |
| --- | --- |
| Products, variants, pricing, inventory, shipping profiles | Medusa |
| Cart, checkout, orders, customers, shipping logic | Medusa |
| Payments | Stripe via Medusa only |
| Shipping labels and rates | Shippo via Medusa only |
| Content, SEO, media, campaigns, editorial pages | Sanity |
| Customer storefront UI | fas-cms-fresh |
| Employee operations console | fas-dash |

## Non-Negotiable Rules

- Sanity is content-only and non-transactional.
- fas-cms-fresh is storefront UI and API consumer only.
- fas-dash is internal operations UI and API consumer only.
- Medusa is the only commerce authority.
- Direct Stripe or Shippo usage outside Medusa is prohibited.
- No duplicate authority for prices, inventory, order state, shipping state, or refunds.

## Required End-State Pipeline

Sanity (content) -> Medusa (commerce brain) -> fas-cms-fresh (storefront) and fas-dash (ops) -> Stripe/Shippo via Medusa.

## Migration Policy

Legacy paths can exist temporarily, but they are deprecated and must not be expanded.
Any new work must reduce drift and move toward the end-state pipeline.

## Execution Tracker

Canonical tracker: docs/governance/FAS_4_REPO_PIPELINE_TASK_TRACKER.md

All architecture, migration, and governance work must map to tracker items and status.
