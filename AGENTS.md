refer to:

> codex.md & AI_GUIDELINES.md
> Access to all fas repositories **fas-sanity** and **fas-cms-fresh** and **fas-medusa** is currently ALLOWED.
> fas-cms-fresh and fas-cms refer to the same codebase and can be used interchangably.
> Local paths to each repo on Amber's machine are as follows:

- **fas-cms-fresh**: `/Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-cms-fresh`
- **fas-medusa**: `/Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa`
- **fas-sanity**: `/Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-sanity`

AGENTS.md is the authoritative architecture reference for commerce responsibilities across all FAS repositories.

# **The Correct Architecture (Authoritative)**

This document is the **single source of truth** for how commerce is architected across all FAS repositories.

If any other documentation, comments, or agent instructions conflict with this section, **this section wins**.

---

## Source of Truth by Responsibility

| **Concern**                                                | **System**                |
| ---------------------------------------------------------- | ------------------------- |
| Products (variants, pricing, inventory, shipping profiles) | **Medusa**                |
| Customers / Orders / Cart / Checkout / Shipping            | **Medusa**                |
| Payments                                                   | **Stripe (via Medusa)**   |
| Shipping labels & live rates                               | **Shippo (via Medusa)**   |
| Content (descriptions, images, SEO, marketing pages)       | **Sanity**                |
| Storefront UI                                              | **fas-cms-fresh (Astro)** |

### Non‑Negotiable Rules

- **Sanity is NOT transactional**
  - No prices, carts, orders, checkout, shipping, or payments
  - Sanity holds content and identifiers only

- **Medusa is the commerce engine**
  - All pricing invariants are enforced in Medusa
  - All carts, orders, and shipping calculations originate in Medusa

- **Stripe and Shippo are accessed only via Medusa**
  - No direct Stripe or Shippo calls from fas-cms-fresh
  - No direct Stripe or Shippo calls from Sanity

- **fas-cms-fresh is UI + API consumer only**
  - Renders storefront UI
  - Calls Medusa APIs
  - Does not compute prices or shipping

Violating these rules WILL cause checkout, pricing, or shipping failures.

---

## End‑State Data Flow (Required)

```
Sanity (content only)
        ↓ (one‑time + enrichment sync)
Medusa (products, variants, pricing)
        ↓
fas‑cms‑fresh storefront
        ↓
Medusa cart & checkout
        ↓
Stripe payment (via Medusa)
        ↓
Shippo shipping (via Medusa)
```

---

## Migration Status

This architecture reflects the **target and enforced end state**.

Legacy systems (direct Stripe, direct Shippo, Sanity‑as‑commerce) may still exist during migration but are **deprecated** and must not be expanded.

Any new work MUST conform to the architecture above.
