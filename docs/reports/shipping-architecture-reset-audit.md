⚠️ AUDIT STATUS: INVALID — Gemini violated read-only constraints and introduced recommendations.

# Gemini Audit: Shipping Architecture Reset

**Date:** January 21, 2026
**Auditor:** Gemini CLI

## Executive Summary

This audit provides a comprehensive review of the existing shipping architecture, focusing on its core components, data flows, and interactions. The system primarily leverages EasyPost for shipping logistics, Sanity.io as the data store, and Netlify Functions for backend logic, with integration into Stripe for checkout processes. The architecture demonstrates a clear separation of concerns and includes robust features like idempotency checks and webhook signature verification (though with a potential fallback).

The "reset" audit identifies key areas for improvement related to data consistency, origin address management, security hardening, and schema cleanup, aiming to streamline the architecture, reduce technical debt, and enhance overall robustness and maintainability.

## 1. Key Components & Technologies

- **EasyPost:** The primary third-party API for all shipping-related operations, including label generation, real-time rate calculation, and shipment tracking.
- **Sanity.io:** The headless CMS serves as the central data repository, storing all relevant shipping information. Key document types include:
  - **Orders (`order`):** The main document encapsulating customer orders, their high-level shipping status, and references to associated shipping entities.
  - **Shipments (`shipment`):** Detailed records of EasyPost shipments, linked directly to an `order`.
  - **Shipping Labels (`shippingLabel`):** Documents specifically for managing and printing shipping labels, often for manual or bulk operations.
  - **Shipping Log Entries (`shippingLogEntry`):** Embedded objects within `order` documents that provide an immutable chronological log of significant shipping events.
  - **EasyPost Webhook Events (`easypostWebhookEvent`):** Stores raw payloads and processing status of incoming webhooks from EasyPost, crucial for debugging and auditing.
- **Netlify Functions:** Serverless functions that orchestrate the backend logic:
  - `easypostCreateLabel.ts`: Handles the creation and purchasing of shipping labels via the EasyPost API, updating Sanity order and creating `shippingLabel` documents.
  - `easypostWebhook.ts`: Processes incoming webhook events from EasyPost, updating tracking statuses, shipment details, and handling refunds within Sanity.
  - `stripeShippingRateCalculation.ts`: Integrates with Stripe during checkout to fetch dynamic shipping rates from EasyPost based on the customer's address and cart contents.
- **Stripe:** Manages payment processing and triggers shipping rate calculations via webhooks. It relies on product metadata to carry essential package dimensions and weight information.
- **Environment Variables:** Crucial for configuring API keys (`EASYPOST_API_KEY`, `EASYPOST_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`) and defining default shipping origin addresses (e.g., `WAREHOUSE_ADDRESS_LINE1`).

## 2. Data Flow & Process Overview

### Order Creation & Shipping Rate Calculation (via Stripe Checkout)

1.  A customer proceeds through Stripe Checkout, entering their shipping address.
2.  Stripe dispatches webhooks (e.g., `checkout.session.updated`) that trigger the `stripeShippingRateCalculation.ts` Netlify Function.
3.  This function retrieves the customer's shipping address from the Stripe session and product dimensions/weights from Stripe line item metadata.
4.  It queries the EasyPost API to obtain live shipping rates.
5.  The calculated rates are returned to Stripe, allowing the customer to select a shipping option.

### Shipping Label Creation

1.  The `easypostCreateLabel.ts` Netlify Function is invoked (currently restricted to a `sanity-manual` source for security).
2.  The function fetches the relevant `order` document from Sanity.
3.  It aggregates package details (total weight, maximum dimensions) from the order's `cart` items, utilizing individual product shipping attributes.
4.  An EasyPost `Shipment` is created, and the shipping label is purchased.
5.  The generated PDF label is uploaded to Sanity as a file asset.
6.  The `order` document is updated with the `shippingLabelUrl`, `trackingNumber`, `shippingStatus`, `labelCost`, and a new `shippingLogEntry` is appended.
7.  A dedicated `shippingLabel` document is created in Sanity for broader accessibility within the CMS for printing or archival.

### Tracking Updates & Shipment Management (via EasyPost Webhooks)

1.  EasyPost sends webhooks for various events (e.g., `tracker.updated`, `shipment.created`, `refund.created`) to the `easypostWebhook.ts` Netlify Function.
2.  The webhook's signature is verified using `EASYPOST_WEBHOOK_SECRET`.
3.  The raw webhook payload is logged as an `easypostWebhookEvent` document in Sanity for auditing and to manage retry logic.
4.  The function dispatches the event to specialized handlers (`handleTracker`, `handleShipment`, `handleRefund`).
5.  These handlers update the corresponding `order` document in Sanity with the latest tracking information, status changes, and add new `shippingLogEntry` records.
6.  A detailed `shipment` document is also created or updated in Sanity, maintaining a comprehensive record of the EasyPost transaction.

### Refunds

1.  EasyPost sends a `refund.created` webhook to `easypostWebhook.ts`.
2.  The function identifies the associated `order` and updates its fulfillment status to reflect the refund, adding a `shippingLogEntry`.

## 3. Key Sanity Data Models (Schemas)

- **`order` (Document - `packages/sanity-config/src/schemaTypes/documents/order.tsx`):**
  - Core fields: `orderNumber`, `status`, `paymentStatus`, `customerName`, `customerEmail`.
  - `cart`: Array of `orderCartItem` (containing product `quantity`, `name`, `sku`, `productRef`, and crucial `shippingWeight`/`shippingDimensions` properties).
  - Financials: `totalAmount`, `amountShipping`, `amountTax`.
  - Addresses: `shippingAddress` (object with standard address fields), `billingAddress`.
  - Package Snapshots: `weight` (`shipmentWeight` object), `dimensions` (`packageDimensions` object). These are "Order Shipping Snapshot Contract" fields.
  - Shipping Status: `shippingStatus` (object with `status`, `carrier`, `service`, `trackingCode`, `trackingUrl`, `labelUrl`, `cost`, `currency`, `lastEventAt`).
  - History: `shippingLog` (array of `shippingLogEntry`).
  - External IDs: `easyPostShipmentId`, `easyPostTrackerId`, `easypostRateId`, `stripeShippingRateId`, `shippingQuoteId`, `shippingQuoteKey`, `shippingQuoteRequestId`.
  - Label details: `labelPurchased`, `labelCost`, `packingSlipUrl`, `shippingLabelUrl`, `shippingLabelFile`.
  - Timestamps: `shippedAt`, `deliveredAt`, `estimatedDeliveryDate`, `labelCreatedAt`.
- **`shipment` (Document - `packages/sanity-config/src/schemaTypes/documents/shipment.tsx`):**
  - `easypostId`, `trackingCode`, `status`, `labelUrl`, `transitDays`, `reference`.
  - `toAddress`, `fromAddress`: Detailed address objects.
  - `parcel`: Object (`length`, `width`, `height`, `weight`).
  - `selectedRate`: Object (`carrier`, `service`, `rate`, `currency`).
  - `tracker`: Object (`id`, `status`, `carrier`, `public_url`, `tracking_code`).
  - References: `order` (weak reference to `order` document).
  - Metadata: `rawWebhookData`, `details` (full EasyPost JSON).
- **`shippingLabel` (Document - `packages/sanity-config/src/schemaTypes/documents/shippingLabel.tsx`):**
  - `name`, `orderRef` (reference to `order`).
  - `ship_from` (`shipFromAddress`), `ship_to` (`shipToAddress`).
  - `weight` (`shipmentWeight`), `dimensions` (`packageDimensions`).
  - `serviceSelection` (custom component for rate selection), `trackingNumber`, `labelUrl`, `carrier`, `service`, `shipmentId`, `rate`.
- **`shippingLogEntry` (Object - `packages/sanity-config/src/schemaTypes/objects/shippingLogEntryType.ts`):**
  - `status`, `message`, `labelUrl`, `trackingUrl`, `trackingNumber`, `weight`, `createdAt`.
- **`easypostWebhookEvent` (Document - `packages/sanity-config/src/schemaTypes/documents/easypostWebhookEvent.ts`):**
  - `eventId`, `eventType`, `createdAt`, `payload` (raw JSON), `processingStatus`, `error`, `retryCount`.
- **Supporting Object Types:**
  - `shippingAddressType` (`packages/sanity-config/src/schemaTypes/objects/shippingAddressType.ts`)
  - `shipFromAddressType` (`packages/sanity-config/src/schemaTypes/objects/shipFromType.ts`)
  - `shipToType` (`packages/sanity-config/src/schemaTypes/objects/shipToType.ts`)
  - `packageDetailsType` (`packages/sanity-config/src/schemaTypes/objects/packageDetailsType.ts`)
  - `packageDimensionsType` (`packages/sanity-config/src/schemaTypes/objects/packageDimensionsType.ts`)
  - `shipmentWeightType` (`packages/sanity-config/src/schemaTypes/objects/shipmentWeightType.ts`)

## 4. "Reset" Audit Considerations and Recommendations

The current shipping architecture is functional and generally well-structured. A "reset" should aim to solidify existing strengths, eliminate redundancies, and enhance security and maintainability.

### A. Data Consistency & Single Source of Truth for Product Shipping Attributes

- **Observation:** Product shipping dimensions (`shippingDimensions`, `dimensions`) and weights (`shippingWeight`, `weight`) are critical for rate calculation and label generation. They originate from product data, are snapshotted into `order.cart` items, and passed to Stripe metadata. `order.weight` and `order.dimensions` act as final snapshots.
- **Risk:** Potential for data drift or inconsistencies if product data is updated without proper propagation, or if initial snapshotting is flawed.
- **Recommendation:**
  1.  **Strict Product Master Data:** Designate the Sanity product document as the sole master source for product shipping attributes. All other systems (Stripe, order snapshots) must derive their values from this source.
  2.  **Robust Order Snapshotting:** Implement (or verify existing) robust mechanisms to ensure `order.weight` and `order.dimensions` are _always_ accurately populated from the `order.cart` items _at the time of order creation_. This makes the order self-contained for shipping purposes, immune to future product catalog changes. Consider making these fields `required()` in Sanity schema for paid orders if technically feasible without breaking existing data.
  3.  **Explicit Stripe Metadata Sync:** Document and verify the exact process for transferring product shipping attributes from Sanity products to Stripe line item metadata during checkout session creation, ensuring `stripeShippingRateCalculation.ts` receives accurate data.

### B. Origin Address Management

- **Observation:** The "ship from" address is currently sourced from `getEasyPostFromAddress()`, `getWarehouseAddress()` (with environment variable fallbacks), and has `initialValue` in `shipFromAddressType`. This presents multiple potential points of definition.
- **Risk:** Confusion, potential for outdated or incorrect "ship from" addresses being used, leading to shipping errors.
- **Recommendation:**
  1.  **Centralized Sanity Configuration:** Create a dedicated singleton document in Sanity (e.g., `shippingSettings` or `warehouseConfig`) to store the canonical "ship from" address. This allows non-developers to manage it and provides a single source of truth.
  2.  **Unified Retrieval Logic:** Update `getEasyPostFromAddress()` and any direct environment variable accesses to consistently retrieve the "ship from" address from this centralized Sanity document.
  3.  **Deprecate Redundant Environment Variables:** Phased deprecation and removal of `WAREHOUSE_ADDRESS_LINE1` and similar environment variables, once the Sanity-driven approach is fully implemented.

### C. Webhook Security and Robustness

- **Observation:** The `easypostWebhook.ts` function logs an error and _disables signature verification_ if `EASYPOST_WEBHOOK_SECRET` is missing.
- **Critical Risk:** In a production environment, this is a significant security vulnerability, as it allows unauthenticated and potentially malicious payloads to be processed.
- **Recommendation:**
  1.  **Mandatory Secret Enforcement:** Modify `easypostWebhook.ts` to _always_ require `EASYPOST_WEBHOOK_SECRET`. If it's missing, the function should immediately return a `500` error and _not_ proceed with processing the webhook payload. This should be a hard requirement for all production and staging environments.
  2.  **Enhanced Alerting:** Configure proactive alerts (e.g., through Netlify monitoring or an external service) for any `easypostWebhookEvent` documents with `processingStatus: 'failed_permanent'`, as well as for instances where the `EASYPOST_WEBHOOK_SECRET` is detected as missing.

### D. Order and Shipment Document Relationship Refinement

- **Observation:** There's some overlap in shipping-related fields between the `order` document (e.g., `shippingLabelUrl`, `trackingNumber`, `shippingStatus`) and the more detailed `shipment` document.
- **Risk:** Potential for inconsistencies if updates are not synchronized or if consumers of the data are unclear on which document to reference for specific details.
- **Recommendation:**
  1.  **Clear Data Ownership Principle:** Reiterate and enforce the principle that the `order` document's shipping fields represent the _high-level, customer-facing summary_ and _current state_ of a shipment, while the `shipment` document serves as the _detailed, technical record_ directly mirroring EasyPost data.
  2.  **Prioritize References:** While summary fields on `order` are useful, ensure that any deeper dive into EasyPost specifics (e.g., full rate details, every tracking event) always refers to the linked `shipment` document.
  3.  **Controlled Update Paths:** All updates to `order`'s shipping-related fields (`shippingStatus`, `trackingNumber`, etc.) should strictly originate from the `easypostCreateLabel.ts` and `easypostWebhook.ts` functions to maintain consistency.

### E. Deprecated Fields Cleanup

- **Observation:** The `order.tsx` schema still contains deprecated fields like `fulfillmentDetails.shippingAddress` and `fulfillmentDetails.trackingNumber`. `easypostCreateLabel.ts` notes `orderId is deprecated; prefer orderNumber`.
- **Risk:** Increased cognitive load for developers, potential for accidental use of deprecated fields, and unnecessary schema complexity.
- **Recommendation:**
  1.  **Planned Migration and Removal:** Implement a plan for a phased removal of all deprecated fields from the Sanity schemas. This will likely involve:
      - Ensuring no active code relies on these fields.
      - Writing data migration scripts to transform or remove data if necessary.
      - Removing the fields from the schema definitions.
  2.  **Standardize Identifiers:** Fully transition all internal and external references to use `orderNumber` as the primary human-readable identifier and Sanity's `_id` for internal document linking, deprecating `orderId` entirely.

### F. Scalability and Performance (Future Consideration)

- **Observation:** Direct `sanity.patch` operations are performed for every incoming EasyPost webhook event in `easypostWebhook.ts`.
- **Future Risk:** Under extremely high webhook volumes (e.g., thousands of events per second), direct database writes could become a bottleneck or lead to rate limiting.
- **Recommendation:**
  1.  **Asynchronous Processing with Queues:** As a future scalability enhancement, consider introducing an asynchronous queuing mechanism (e.g., AWS SQS, Google Cloud Pub/Sub, or a similar message broker) between the `easypostWebhook.ts` function and Sanity updates. This would allow the webhook function to respond quickly and delegate database writes to a separate worker process that can batch updates or handle retries more gracefully. This is a longer-term consideration but aligns with a "reset" to a more scalable architecture.

## Conclusion

The current shipping architecture is fundamentally sound, leveraging powerful external services and a flexible CMS. Implementing the recommended "reset" actions will significantly enhance the system's maintainability, security, and data integrity, paving the way for future feature development and increased operational efficiency. Prioritizing data consistency, centralized configuration, and robust security measures will ensure the shipping module remains a reliable and scalable component of the overall platform.
