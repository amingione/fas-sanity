# Stripe Coupons Audit Report

## 1. Executive Summary

This audit confirms that the "All Stripe Coupons" list in Sanity Studio is empty because there is no `stripeCoupon` document type or a dedicated sync mechanism to pull all coupons from Stripe. Coupon data is currently embedded within individual `customer` documents and is only synced when a discount is applied to a specific customer. This design limits the ability to view, manage, and apply coupons universally across all customers.

## 2. Audit Findings

### 2.1. Schema Confirmation

- **Finding:** There is no `stripeCoupon` or `coupon` schema in `packages/sanity-config/src/schemaTypes/`.
- **Impact:** Without a dedicated schema, there is no centralized place to store and manage Stripe coupon data in Sanity.

### 2.2. Existing Stripe Sync Patterns

- **Finding:** Stripe data is synced via Netlify Functions, primarily `stripeWebhook.ts` and `syncStripeCatalog.ts`. The `stripeWebhook.ts` function handles `customer.discount.*` events, which is how customer-specific discounts are updated in Sanity. However, there is no mechanism to sync all coupons from Stripe.
- **Impact:** The current sync pattern is reactive and customer-centric, not proactive or global.

### 2.3. Recommended Document Ownership

- **Finding:** The `discountsStructure.ts` and `discountsList.tsx` components exist and are configured to display coupon information, but they query against the `customer` document type.
- **Recommendation:** A new `stripeCoupon` document type should be created within the `fas-sanity` repository. This will provide a centralized location for managing all Stripe coupons.

### 2.4. Studio List Configuration

- **Finding:** The Desk Structure (`packages/sanity-config/src/desk/deskStructure.ts`) includes a "Customer Coupons (Stripe)" section that uses custom components (`DiscountsListAll`, etc.) to display coupon data. These components are hardcoded to query the `discounts` field within `customer` documents.
- **Impact:** The UI is already in place to display coupons, but it's pointing to the wrong data structure for a global coupon view.

### 2.5. `fas-cms` Assumptions

- **Finding:** No references to `coupon` or `stripeCoupon` were found in `fas-cms` that would indicate an expectation of coupon data existing in a particular format.
- **Impact:** There are no immediate downstream dependencies in `fas-cms` that would be broken by the introduction of a new `stripeCoupon` schema.

## 3. Required Stripe Fields

A new `stripeCoupon` schema should include the following fields to mirror the data from Stripe:

- **`id`** (string, required): The Stripe coupon ID.
- **`name`** (string): The coupon name.
- **`percent_off`** (number): The percentage discount.
- **`amount_off`** (number): The fixed amount discount.
- **`currency`** (string): The currency of the `amount_off`.
- **`duration`** (string, enum: `once`, `repeating`, `forever`): The duration of the coupon.
- **`duration_in_months`** (number): The number of months the coupon is valid if `duration` is `repeating`.
- **`valid`** (boolean): Whether the coupon is currently valid.
- **`redeem_by`** (datetime): The expiration date of the coupon.
- **`metadata`** (object): Any metadata associated with the coupon in Stripe.

## 4. Risks and Edge Cases

- **Expired Coupons:** The sync mechanism should handle expired and deleted coupons in Stripe, ensuring they are marked as invalid in Sanity.
- **Percent vs. Amount:** The schema and UI should clearly distinguish between percentage-based and fixed-amount coupons.
- **Data Backfill:** A backfill script will be needed to populate the new `stripeCoupon` documents with existing coupon data from Stripe.
- **Promotion Codes:** The solution should consider Stripe's Promotion Codes, which are customer-facing codes that map to a single underlying coupon.
