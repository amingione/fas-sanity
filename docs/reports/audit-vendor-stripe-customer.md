# Vendor → Stripe Customer Integration Compatibility Audit

## Is this compatible with the current system?
**No.** The proposal is fundamentally incompatible with the existing architecture.

## Blocking Conflicts
1.  **Data Model Conflict:** The current architecture explicitly models a "Vendor" as a specialized type of "Customer". The `vendor` schema contains a `customerRef` field, which links to a `customer` document. The `customer` document, in turn, has `roles` and `customerType` fields that can identify it as a vendor. The proposal to add `stripeCustomerId` directly to the `vendor` document bypasses this established relationship and creates a conflicting data model.
2.  **Data Duplication Risk:** The canonical `stripeCustomerId` is stored on the `customer` document. Adding this field to the `vendor` document would create two sources of truth for the same identifier, leading to a high risk of data inconsistency.
3.  **Workflow Incompatibility:** All existing payment, invoicing, and reporting workflows are built around the `customer` document as the source of truth for Stripe customer information. Introducing a parallel `stripeCustomerId` on the `vendor` document would require a major and unnecessary refactoring of all these critical workflows.

## Non-Blocking Concerns
- Even if the blocking conflicts were resolved, this approach would lead to a more complex and confusing data model, making future development and maintenance more difficult.

## Assumptions That Must Be Decided Explicitly
- The core assumption of the proposal is that a `vendor` should be a separate entity from a `customer` in the context of Stripe. This is incorrect. The current architecture is intentionally designed for a `vendor` to be represented by a `customer` document, which then holds all Stripe-related information.

## Recommendation
**Reject.**

The proposal should be rejected in its current form. The correct and compatible approach is to build upon the existing architecture:

1.  When a `vendor` needs to be synced with Stripe, the workflow should first find or create a corresponding `customer` document.
2.  This `customer` document should be identified as a vendor by setting its `customerType` to `'vendor'` and/or adding `'vendor'` to its `roles` array.
3.  The `stripeCustomerId` obtained from Stripe should be saved to this `customer` document.
4.  The `vendor` document should then be linked to this `customer` document via the `customerRef` field.

Any new functionality, such as a Studio document action to sync a vendor, should follow this established pattern to maintain data integrity and compatibility with existing workflows.
