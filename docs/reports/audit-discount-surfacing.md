# Discount & Coupon Studio Surfacing Audit

## Canonical Discount Document Type
The canonical representation of a Stripe discount/coupon is not a top-level Sanity document. Instead, it is an object of type `customerDiscount` stored within an array field named `discounts` on the `customer` document.

## Field Inventory
The `customerDiscount` object contains the following fields, which are populated from Stripe's `Discount`, `Coupon`, and `PromotionCode` objects via the `stripeWebhook` and `customerDiscounts.ts` library:

- **`_type`**: `customerDiscount`
- **`stripeDiscountId`**: The Stripe Discount ID (e.g., `di_...`).
- **`stripeCouponId`**: The Stripe Coupon ID (e.g., `co_...`).
- **`couponName`**: The internal name of the coupon in Stripe.
- **`promotionCodeId`**: The Stripe Promotion Code ID (e.g., `promo_...`).
- **`percentOff`**: The percentage discount.
- **`amountOff`**: The fixed amount discount.
- **`currency`**: The currency of the fixed amount discount.
- **`duration`**: `once`, `repeating`, or `forever`.
- **`durationInMonths`**: The number of months the discount repeats.
- **`redeemBy`**: ISO 8601 timestamp for when the coupon must be redeemed.
- **`startsAt`**: ISO 8601 timestamp for when the discount becomes active.
- **`endsAt`**: ISO 8601 timestamp for when the discount expires.
- **`createdAt`**: ISO 8601 timestamp for when the coupon was created.
- **`maxRedemptions`**: The maximum number of times the coupon can be redeemed.
- **`timesRedeemed`**: The number of times the coupon has been redeemed.
- **`valid`**: A boolean indicating if the coupon is currently valid.
- **`livemode`**: A boolean indicating if the object was created in live mode.
- **`metadata`**: An array of key-value pairs from the Stripe coupon's metadata.
- **`status`**: A calculated status of `active`, `scheduled`, or `expired`.
- **`stripeLastSyncedAt`**: An ISO 8601 timestamp for the last sync time.

## Editability Assessment
- **Stripe-Authoritative**: All fields are populated directly from Stripe webhooks. They should be treated as **read-only** in the Sanity Studio to avoid data inconsistency.
- **Internal (Safe for Edit)**: There are no fields on the `customerDiscount` object that are safe for manual editing. The entire object's state is managed by the Stripe integration.

## Conflicts or Risks
- **No Direct Document to Surface**: Since discounts are objects within the `customer` document, they cannot be surfaced as a top-level document type in the Studio. They can only be viewed and managed within the context of a specific customer.
- **Creation Workflow**: The `CustomerDiscountsInput` component provides a UI to *create* new discounts, but this is a one-way action that calls a Netlify function (`createCustomerDiscount`). It does not edit existing discounts. This is a safe pattern, but it means that all modifications must happen in Stripe.
- **No Classification**: There is no field to classify discounts (e.g., "customer", "vendor", "promo"). The classification is implicitly "customer" due to its location within the `customer` document. This would make it difficult to query for or manage other types of discounts (e.g., global promotions) if they were to be added to this array.
