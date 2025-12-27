## `discountsList.tsx` Audit Report

### Goal

To discover why already created discounts/coupons are not being shown in the Studio's `discountsList.tsx` view.

### Findings

1.  **Data Source:** The `discountsList.tsx` component explicitly queries for `discounts` nested within `customer` documents. The relevant part of the query is `*[_type == "customer" && defined(discounts)].discounts`.
2.  **Expected Data Structure:** The component expects to receive an array of objects with fields like `stripeDiscountId`, `stripeCouponId`, `promotionCodeId`, `couponName`, `percentOff`, `amountOff`, etc., which correspond to the `customerDiscount` object type.
3.  **Existing Discount Data Models (from previous audits):**
    - **Stripe-synced discounts:** These are stored as `customerDiscount` objects within the `discounts` array of `customer` documents. This is the only type of discount this component is designed to display.
    - **Product-level sales:** These are defined by `discountType`, `discountValue`, `salePrice`, and `discountPercent` fields directly on `product` documents.
    - **Quote/Invoice-level discounts:** These are defined by `discountType` and `discountValue` fields directly on `quote` and `invoice` documents.
    - **No top-level `discount` document:** There is no schema for a top-level `discount` document type.

### Conclusion: Why Discounts Are Not Being Shown

The `discountsList.tsx` component is functioning correctly according to its design. It is specifically built to display **Stripe-synced customer-level discounts** (i.e., `customerDiscount` objects nested within `customer` documents).

If the "already created discounts/coupons" are not appearing, it is because they fall into one of the following categories:

1.  **Product-level sales:** Discounts configured directly on `product` documents are not `customerDiscount` objects and are not queried by this component.
2.  **Quote/Invoice-level discounts:** Discounts configured directly on `quote` or `invoice` documents are not `customerDiscount` objects and are not queried by this component.
3.  **Stripe-synced customer discounts that are not yet synced:** If a discount was created in Stripe but the webhook event has not yet been processed, or if there was an error during syncing, it would not appear.
4.  **Discounts that are not associated with a `customer` document:** The query explicitly requires `defined(discounts)` on a `customer` document.

### Conflicts or Risks

- **Misaligned Expectations:** The primary conflict is between the user's general expectation of "discounts/coupons" and the specific data model that `discountsList.tsx` is designed to display. The component only shows customer-specific Stripe discounts.
- **No Centralized View:** There is no single, centralized view in the Studio that aggregates _all_ types of discounts (product sales, customer discounts, quote/invoice discounts).

### Recommendation

- **Clarify Scope:** The `discountsList.tsx` component should be understood as a "Customer Discounts List" rather than a generic "Discounts & Coupons" list.
- **Educate Users:** Users need to be aware that product-level sales and quote/invoice discounts are managed directly on those respective document types, not in this list.
- **Consider New Views (No Implementation):** If a centralized view of all discount types is desired, a new Studio component and corresponding queries would need to be developed. This is outside the scope of this audit.
