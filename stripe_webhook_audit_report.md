# Stripe Webhook Auditor's Report

## 1. Findings

This report details the operational assumptions of the `stripeWebhook` Netlify function and their departures from observed Stripe API and webhook behavior, leading to "Customer identity conflict" errors.

### Assumptions in `stripeWebhook` Logic

The core logic, particularly within the `strictFindOrCreateCustomer` and `strictFindOrCreateCustomerFromStripeCustomer` functions, operates on a set of assumptions about customer identity and data flow.

#### A. Stripe Customer Uniqueness
*   **System Assumption:** The system assumes a one-to-one relationship between a Stripe Customer ID (`cus_...`) and a Sanity `customer` document. While it maintains an array (`stripeCustomerIds`) to store multiple Stripe IDs, the lookup logic prioritizes the primary `stripeCustomerId` field.
*   **Observed Behavior:** The logic attempts to reconcile users by email and Stripe Customer ID. A conflict is thrown if a lookup by Stripe ID finds `Customer A`, but a lookup by email finds `Customer B`, and `Customer B` is also linked to a `vendor` record. This indicates an assumption that a vendor's Stripe ID and email will always resolve to the same Sanity customer document.

#### B. Email Reuse
*   **System Assumption:** A single email address is treated as a durable, unique identifier for a single logical customer in Sanity. The system assumes that if a Stripe customer object or checkout session provides an email, that email should resolve to exactly one existing Sanity `customer`.
*   **Observed Behavior:** The logic aggressively attempts to find a customer by email (`fetchCustomerByEmail`). If a Stripe Customer ID is not found in Sanity, the system falls back to an email lookup. This becomes problematic when a user checks out as a guest with an email that already exists in the system under a different Stripe Customer ID.

#### C. Checkout Session Retries
*   **System Assumption:** The system does not explicitly account for a user retrying a checkout session after a failure. It treats each `checkout.session.completed` event as a distinct transaction that should resolve to a single, consistent customer record.
*   **Observed Behavior:** If a user's first payment attempt fails and they retry with a different email or payment method, Stripe may create a new Guest Customer object. The webhook handler then receives a new `checkout.session.completed` event, potentially with a new Stripe Customer ID but a familiar email, triggering the conflict condition.

#### D. Abandoned Checkout Flows
*   **System Assumption:** The logic for handling `checkout.session.expired` events and abandoned checkouts runs in parallel to the order creation logic but doesn't appear to be fully integrated into the customer identity resolution process for subsequent successful checkouts.
*   **Observed Behavior:** A user might abandon a cart, which is recorded. They might later return and complete a purchase. If they use a slightly different email or payment method, a new Stripe Customer could be generated, creating two distinct Stripe customer identities for what the business considers one logical user journey. The webhook logic is not designed to merge or reconcile these scenarios gracefully.

## 2. Behavioral Mismatch Summary

The root of the "Customer identity conflict" lies in the impedance mismatch between Stripe's flexible, event-driven customer creation model and the webhook's rigid, deterministic customer resolution strategy.

*   **Stripe's Behavior:** Stripe prioritizes successful transactions. It will readily create new guest Customer objects for checkouts to minimize friction. An end-user can easily generate multiple `cus_...` IDs by:
    *   Using different email addresses across checkouts.
    *   Using different payment methods (e.g., credit card vs. Apple Pay) that are not linked to a single Stripe customer account.
    *   Checking out as a guest instead of logging in.

*   **Webhook's Assumption:** The webhook logic assumes a stricter, more controlled customer model. It expects that an email address or a Stripe Customer ID can be used interchangeably to uniquely identify a single record in Sanity. When Stripe's flexible model produces a scenario where `cus_A` and `email_B` are associated with a single transaction, but the system's records show `cus_A` belongs to `Sanity_Doc_1` and `email_B` belongs to `Sanity_Doc_2`, the webhook correctly identifies a conflict but incorrectly treats it as a hard failure.

## 3. Conflict Condition Classification

The observed conflicts can be classified as follows:

*   **Expected Stripe Behavior (Most Cases):** The creation of multiple Stripe Customer IDs for a single logical user is not a bug; it is a feature of how Stripe's checkout and payment links are designed to reduce buyer friction. The webhook's failure to handle this is a shortcoming in the webhook's design, not an error on Stripe's part.
*   **Recoverable Data Ambiguity (All Cases):** The "Customer identity conflict" is a form of data ambiguity. The system has two valid but conflicting pieces of information (a Stripe ID and an email) and lacks a clear business rule for how to proceed. This is recoverable. The system could be designed to flag these conflicts for manual review, to merge the customer records, or to prioritize one identifier over the other, rather than failing the webhook.
*   **Legitimate Hard Failure (None Observed):** A legitimate hard failure would be a situation where data is corrupted or a downstream service is unavailable. The current conflict is a logical error, not a system failure. The webhook is successfully receiving data and connecting to dependent services.

## 4. Risk Assessment & Stripe Best Practices

*   **Violation of Best Practices:** The current "fail on conflict" behavior **violates** Stripe's webhook best practices. Stripe's documentation consistently emphasizes that webhook endpoints must be resilient and idempotent. An endpoint should return a `200 OK` status code as quickly as possible to acknowledge receipt of the event. Business logic failures, such as an inability to resolve a customer, should be handled gracefully in the background. Failing the webhook repeatedly for the same logical error can lead to Stripe disabling the endpoint.

*   **Risk Assessment:**
    *   **High Risk of Data Loss:** By returning a non-200 status, the webhook is signaling to Stripe that the event was not processed. If this continues, Stripe will stop sending webhooks, leading to missed orders, failed customer record updates, and incomplete data in Sanity.
    *   **High Risk of Service Disruption:** Stripe may disable a webhook endpoint that consistently fails, leading to a complete outage of the order processing pipeline until it is manually re-enabled.
    *   **Moderate Risk of Customer Data Inconsistency:** The current logic creates a race condition. Depending on the timing of events, a customer might be created successfully or might trigger a conflict, leading to an unreliable customer database.

In summary, the webhook's strict assumptions about customer identity are incompatible with Stripe's real-world behavior, and the "fail on conflict" error handling strategy is brittle and poses a significant risk to data integrity and service stability.
