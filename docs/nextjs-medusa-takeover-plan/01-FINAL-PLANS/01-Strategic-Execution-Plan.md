# FAS Restructure — Strategic Execution Plan (In Order)

FAS Restructure — Strategic Execution Plan (In Order)

This is the correct sequence. Do not skip steps. Do not build UI before backend is locked.

⸻

Phase 0 — Lock Architecture (No Code Yet)

Objective: Freeze system boundaries.
	1.	Finalize system roles:
	•	Medusa = commerce authority
	•	Next.js = internal ops console
	•	Sanity = content + experience only
	•	Astro = storefront render layer
	2.	Write a short governance doc:
	•	“Sanity never owns price, stock, order state, payment, or shipping execution.”
	3.	Remove all “maybe we could…” branches.

Done means: Everyone (including AI prompts) follows this model consistently.

⸻

Phase 1 — Stabilize Medusa (Foundation First)

Objective: Make Medusa boring and stable before touching UI.
	1.	Deploy Medusa to a real host (not localhost, not Netlify).
	2.	Confirm:
	•	Product creation works
	•	Variant ↔ price linking works
	•	Cart math works
	•	Shipping rate retrieval works
	•	PaymentIntent flow works
	•	Order creation works
	•	Label purchase works
	3.	Lock environment variables.
	4.	Document the API contract.

Done means: Every critical flow works via curl/Postman without frontend.

⸻

Phase 2 — Sanity Restructure (Content-Only Refactor)

Objective: Strip Sanity down to its correct role.
	1.	Fork and refactor product schema.
	2.	Remove:
	•	Pricing fields
	•	Inventory fields
	•	Stripe IDs
	•	Shipping objects
	3.	Remove transactional schemas (orders, invoices, quotes, vendor ops, etc.).
	4.	Add new content-focused schemas:
	•	brandAsset
	•	legalContent
	•	navigationMenu
	•	badge
	•	faqPage
	•	Templates (email/quote/invoice layout only)
	5.	Redesign Studio desk structure.

Done means: Sanity Studio feels clean and content-focused.

⸻

Phase 3 — Define Sync Contracts

Objective: Make integration predictable.
	1.	Medusa → Sanity:
	•	On product create: create stub doc
	•	On product update: update sync timestamp
	2.	Sanity → Astro:
	•	Rebuild on publish
	3.	Sanity → Next:
	•	Templates fetched at runtime
	4.	Sanity never writes commerce logic.

Done means: All integration flows are documented and deterministic.

⸻

Phase 4 — Build Next.js Internal Ops Console

Objective: Replace all operational clutter removed from Sanity.

Start small but functional:

Module 1: Order Desk
	•	Search orders
	•	View order details
	•	Internal notes
	•	Status view

Module 2: Quote Builder
	•	Create quote cart via Medusa
	•	Add SKU + qty
	•	Retrieve shipping rates
	•	Save as quote
	•	Convert to order

Module 3: Shipping Console
	•	Retrieve rates (UPS only)
	•	Purchase label
	•	Print/download
	•	Write tracking back to Medusa

Module 4: Customer Panel
	•	View order history
	•	Vendor flags
	•	Manual overrides (audited)

Important rule:
Next calls Medusa. It never calculates anything itself.

Done means: Ops team can handle phone + vendor + in-store without Sanity.

⸻

Phase 5 — Remove Legacy Systems

Objective: Eliminate dead weight.
	1.	Delete transactional schemas from Sanity.
	2.	Delete Stripe/Shopify legacy types.
	3.	Remove webhook proxies that are no longer needed.
	4.	Remove duplicate shipping logic.
	5.	Update documentation.

Done means: No overlapping authority anywhere.

⸻

Phase 6 — Optimize UX & Performance

Objective: Make it usable and fast.
	1.	Improve Studio desk filtering.
	2.	Add content completeness indicators.
	3.	Add vendor pricing views in Next.
	4.	Add role-based access control.
	5.	Add activity logging in Next.

⸻

Phase 7 — Hardening & Governance

Objective: Prevent regression.
	1.	Add architecture governance file.
	2.	Add checklist YAML.
	3.	Add enforcement rule:
	•	Any new schema must declare which system owns authority.
	4.	Add CI check to prevent pricing fields reappearing in Sanity.

⸻

Strategic Order Summary

You must follow this exact order:
	1.	Lock architecture
	2.	Deploy and stabilize Medusa
	3.	Refactor Sanity
	4.	Define sync contracts
	5.	Build Next.js ops console
	6.	Remove legacy
	7.	Harden governance

If you reverse 3 and 5, chaos returns.
If you build Next before Medusa is stable, it breaks again.

⸻

The One Rule That Prevents Collapse

Backend first. Always.

UI is paint.
Medusa is concrete.

You were painting before the concrete cured.

