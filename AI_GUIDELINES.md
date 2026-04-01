# AI Development Guidelines

## Architecture Authority

This repository follows the 4-repo FAS architecture.

- Medusa is the commerce authority.
- Sanity is content-only.
- fas-cms-fresh and fas-dash are consumers of Medusa authority.
- Stripe and Shippo are accessed only via Medusa.

If any guidance conflicts with AGENTS.md, AGENTS.md wins.

## Scope of This Repo (fas-sanity)

Sanity is responsible for:

- Product content enrichment (descriptions, SEO, media)
- Editorial content (blogs, campaigns, promo pages)
- Marketing and CRM-style operational content where explicitly approved

Sanity is not responsible for:

- Pricing, inventory, checkout, orders, returns, payment state, shipping state

## Safety Rules

- Never introduce transactional commerce logic into Sanity schemas.
- Never make Sanity a source of truth for cart/order/payment/shipping decisions.
- Any mirrored commerce data in Sanity must be clearly labeled as read-only/derived.

## UI Guidance

UI guidance in this repository applies to Sanity Studio only.
It must not imply ownership of commerce behavior.

## Required Process

- Map all architecture changes to: docs/governance/FAS_4_REPO_PIPELINE_TASK_TRACKER.md
- Keep governance docs aligned with AGENTS.md.
- Stop and escalate when authority boundaries are unclear.
