AUTHORITATIVE CODEX AUDIT — CUSTOMER ↔ INVOICE ACTIVITY MAPPING
(Read-only audit; no code changes executed)

Audit highlights

customer.ts has orders and quotes in the activity group, but no invoices field.
invoiceContent.tsx stores invoices with customerRef, so the link already exists.
customerActions.tsx already queries invoices for the customer history modal, so the missing schema field is likely why the “activity” group in the customer document doesn’t show invoices.
Fix plan (pending your approval)

Add a new customerInvoiceSummary object type (similar to customerOrderSummary) with minimal fields like invoiceNumber, status, createdAt, total, and maybe invoiceId or invoiceRef depending on how you want to link.
Add a new invoices array field to the customer schema under the activity group, likely read-only to prevent manual edits.
Create a migration/backfill script (e.g. backfill-customer-invoices.ts) that batches customers, looks up invoices by customerRef, and writes summary entries to customer.invoices. Include a --dryRun flag and pagination.
Optionally wire this into the existing backfill flow (backfillCustomers.ts or a new function) if you want it runnable via Netlify like other backfills.
Questions before I start

---

Approved Implementation Decisions (Authoritative)

1. Storage model

- customer.invoices MUST store snapshot summary fields
- No live references or joins at render time

2. Studio behavior

- customer.invoices MUST be conditionally readOnly:
  - readOnly: true when invoice originated from an online order
  - readOnly: false when invoice was created manually (in-store)
- This condition MUST be derived from existing invoice metadata or flags
- No new invoice creation paths are introduced

3. Backfill execution

- Customer invoice backfill MUST be wired into the existing backfill runner
- The backfill MUST:
  - Support pagination
  - Support a --dryRun mode
  - Be idempotent and safe to re-run

Enforcement Handoff

This document is authoritative for:

- Schema changes required to surface invoices in the customer Activity tab
- Migration and backfill scope for existing customers

This document explicitly authorizes:

- Adding a customerInvoiceSummary object type
- Adding a customer.invoices activity array field
- Writing a backfill script to populate customer.invoices from invoices via customerRef

This document explicitly forbids:

- Changes to invoice authority or creation logic
- Changes to order, Stripe, or shipping behavior
- UI refactors outside schema-backed Activity rendering
