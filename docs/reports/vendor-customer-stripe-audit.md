# Vendor-Customer-Stripe Identity Audit Report

## 1. Root Cause Analysis

The primary reason vendor documents require manual linking to customer documents is that the system has two separate, and functionally different, code paths for synchronizing Stripe customers to Sanity, only one of which is "vendor-aware."

1.  **Checkout-Driven Path (Vendor-Aware):** The `checkout.session.completed` Stripe webhook event triggers the `createOrderFromCheckout` function, which in turn calls `strictFindOrCreateCustomer`. This function correctly identifies if a customer's email matches an existing vendor's primary contact email. If a match is found, it creates the necessary `customer` document (if it doesn't exist), assigns the `vendor` role, and programmatically populates the `customerRef` field on the `vendor` document.

2.  **Stripe-Driven Path (Not Vendor-Aware):** The `customer.created` and `customer.updated` Stripe webhook events trigger the `syncStripeCustomer` function. This function is designed only to create or update a `customer` document in Sanity based on the Stripe customer data. It has no logic to check for a matching `vendor` document or to create/update the `customerRef` link.

This leads to a situation where if a Stripe customer is created or updated through any means other than a completed checkout (e.g., manually in the Stripe dashboard, via a direct API call, or through another integrated service), a `customer` document is created in Sanity without any connection to a corresponding `vendor` document. This unlinked `customer` then requires a manual process to establish the relationship, which is further complicated by the fact that the `customerRef` field on the `vendor` schema is `readOnly`, implying the manual fix must be done via a script or API call.

## 2. Responsible Files and Fields

### Schema-Related

*   **File:** `packages/sanity-config/src/schemaTypes/documents/vendor.ts`
    *   **Field:** `customerRef`
    *   **Reason:** This `reference` field being `readOnly` confirms that the link is intended to be programmatic. Its existence separates the `vendor` and `customer` identities, making the sync logic responsible for bridging the gap.

*   **File:** `packages/sanity-config/src/schemaTypes/documents/customer.ts`
    *   **Field:** `stripeCustomerId`
    *   **Reason:** This field is the key identifier for linking a Sanity customer to a Stripe customer.
    *   **Field:** `roles`
    *   **Reason:** The `vendor` role is used to signify that a customer is also a vendor, and its presence is validated by the `customerRef` field on the `vendor` document.

### Sync-Logic-Related

*   **File:** `netlify/functions/stripeWebhook.ts`
    *   **Function:** `handler` (specifically the `switch` statement for event types)
        *   **Event Cases:** `customer.created`, `customer.updated`
        *   **Reason:** These event handlers call `syncStripeCustomer`, the non-vendor-aware function. This is the direct cause of the problem for customers created outside the checkout flow.
    *   **Function:** `syncStripeCustomer`
        *   **Reason:** This function is the implementation of the non-vendor-aware sync logic. It creates `customer` documents without checking for or linking to `vendor` documents.
    *   **Function:** `strictFindOrCreateCustomer`
        *   **Reason:** This is the "correct" or "vendor-aware" implementation of the sync logic. It is called during the `checkout.session.completed` event and properly links vendors and customers. Its limited use is the crux of the issue.

## 3. Issue Classification

The issue is primarily **sync-logic-related**, with contributing factors from the **schema design**.

*   **Sync Logic:** The core problem is the inconsistent implementation of the customer synchronization logic. The existence of two different functions with different capabilities (`strictFindOrCreateCustomer` vs. `syncStripeCustomer`) for handling the same conceptual entity (a customer) is the direct cause of the discrepancy.
*   **Schema:** The schema design choice to have separate `vendor` and `customer` documents, linked by a `readOnly` reference, makes the system entirely dependent on the sync logic to correctly establish the relationship. While this schema is not inherently incorrect, it magnifies the impact of the flawed sync logic.

## 4. Summary

Vendors that represent Stripe customers require manual linking because the webhook that processes `customer.created` and `customer.updated` events from Stripe is not designed to handle the vendor linking logic. It creates a `customer` document but fails to create or link the corresponding `vendor` document. The vendor-aware logic only runs during the `checkout.session.completed` event, leaving a significant gap in the synchronization process for any customers created outside of that specific flow.
