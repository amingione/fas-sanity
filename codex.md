Codex Guidance - FAS Motorsports

Project: FAS 4-repo commerce platform
Last Updated: 2026-04-01

This file defines Codex operating expectations for fas-sanity.

## Canonical Authority

- Primary architecture authority: AGENTS.md (this repo)
- Canonical tracker: docs/governance/FAS_4_REPO_PIPELINE_TASK_TRACKER.md

If any document conflicts with AGENTS.md, AGENTS.md wins.

## 4-Repo Target Model

- fas-medusa: commerce brain and authority
- fas-cms-fresh: customer storefront, Medusa consumer only
- fas-dash: employee operations hub, Medusa consumer only
- fas-sanity: content and marketing system only

## Hard Prohibitions

- No direct Stripe usage outside Medusa for commerce flows
- No direct Shippo usage outside Medusa for commerce flows
- No pricing/inventory/order/shipping authority in Sanity
- No split-authority logic across repos

## Operating Mode

- Patch existing flows first; avoid architecture redesign unless requested
- Resolve governance drift immediately when discovered
- Tie all migration work to explicit tracker tasks and status updates
