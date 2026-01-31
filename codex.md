Codex Guidance — FAS Motorsports

Project: FAS Motorsports Commerce Platform
Last Updated: January 2026
Audience: AI coding agents (Codex, Claude, Copilot) and human contributors

⸻

Overview

This document provides practical guidance for working across the FAS Motorsports codebase.
Its purpose is to:
• reduce accidental breakage
• prevent split-authority commerce logic
• support an ongoing architecture transition
• keep development moving without unnecessary friction

This is not a punitive ruleset.
When uncertainty exists, document assumptions and proceed carefully.

⸻

Architecture Guidance (Source of Truth)

This project follows a Medusa-first commerce direction.

Current Intent
• Medusa is the primary authority for commerce logic:
• products
• variants
• pricing
• inventory
• cart
• checkout
• orders
• shipping
• Sanity is authoritative for:
• content
• editorial data
• media
• SEO
• historical / reporting records
• Stripe and Shippo are routed through Medusa in the target architecture.
• fas-cms-fresh renders UI and consumes APIs.

Transitional Reality
• Some legacy Stripe and Shippo flows still exist
• Some data may be mirrored between systems during migration
• Not all legacy paths are removed yet

If a task appears to conflict with this guidance:

Pause and confirm intent before enforcing or refactoring.

⸻

DEFAULT MODE: Schema-Aware Development

This is the recommended starting mode for most tasks.
• Sanity schemas are authoritative for content and persisted records
• Commerce data structures originate in Medusa
• Code should align with schemas when practical
• Schema changes should be intentional and discussed
• If alignment is unclear, document assumptions and proceed cautiously

This mode is meant to reduce drift, not block progress.

⸻

Commerce Responsibilities (At a Glance)

Concern Primary Authority
Products / Variants / Pricing Medusa
Inventory Medusa
Cart & Checkout Medusa
Orders (creation & validation) Medusa
Shipping rates & labels Medusa
Payments Stripe (via Medusa)
Content / Media / SEO Sanity
UI / SSR fas-cms-fresh

Sanity order documents represent snapshots, not live commerce truth.

⸻

Stripe & Shipping Guidance

Stripe
• Some legacy direct Stripe integrations exist
• Target architecture routes Stripe through Medusa
• When modifying checkout:
• prefer Medusa flows unless explicitly working on legacy code
• do not re-implement pricing or totals outside Medusa

Shipping (Shippo)
• Shipping is calculated and validated in Medusa
• Legacy Shippo calls may exist during transition
• Avoid duplicating shipping logic in the storefront

⸻

Change Control Guidelines

These rules exist to reduce accidental breakage, not to slow development.

High-Risk Changes (Avoid Unless Necessary)
• Introducing new pricing logic outside Medusa
• Computing totals in the frontend or Sanity
• Modifying checkout behavior without end-to-end testing
• Altering payment or shipping flows without validation

Requires Coordination
• Schema changes
• Checkout refactors
• Medusa pricing or cart changes
• Sync logic between Sanity and Medusa

Generally Safe
• UI changes
• Content rendering changes
• Non-functional refactors
• Documentation updates
• Logging improvements

⸻

Safety Rules (Remain Strict)

The following areas must remain strict:
• Secrets, tokens, API keys
• Authentication and authorization boundaries
• Payment integrity
• Shipping label purchase and refunds
• Production data mutation
• Webhook verification

If unsure, pause and confirm intent.

⸻

Working With Transitional Code

Because the system is mid-migration:
• Do not assume all legacy paths are incorrect
• Do not aggressively delete “unused” code without context
• Prefer incremental alignment over hard rewrites
• Leave comments when working around legacy behavior

⸻

Testing Expectations

When touching commerce-related code:
• Verify cart insertion
• Verify pricing correctness
• Verify shipping options
• Verify checkout completion
• Verify no regression for existing products

Manual testing is acceptable where automation does not yet exist.

⸻

Common Pitfalls to Avoid
• Treating Sanity as a pricing engine
• Assuming missing Medusa data can be inferred
• Re-introducing direct Stripe logic “temporarily”
• Fixing symptoms outside the commerce engine

⸻

Remember
• Medusa is king 👑 for commerce
• Sanity is for content and records
• Guidance exists to help, not block
• When uncertain, document assumptions
• Progress > perfection during transition

⸻

Final Note

This document reflects current reality, not historical architecture.

As migration completes, rules may tighten again — but not before they’re ready to.

If something here feels unclear, raise it instead of guessing.
