# Proposed Discount Schema Compatibility Audit

## 1. Existing Schema Conflicts

- **Blocking:** Yes, a `discount` concept already exists and is deeply integrated.
  - **`customer.discounts`**: The `customer` schema has a `discounts` array field containing `customerDiscount` objects. This is the primary representation of Stripe-based discounts.
  - **`product` schema**: Contains fields for `discountType`, `discountValue`, and `salePrice` to manage product-specific sales.
  - **`quote` & `invoice` schemas**: Both include `discountType` and `discountValue` fields for order-level discounts.
  - **`vendor` schema**: Has a `customDiscountPercentage` for wholesale pricing.
- **Semantic Overlap:** The proposed schema's functionality (product, category, and cart-level discounts) significantly overlaps with these existing, disparate implementations.

## 2. Reference Integrity

- **Non-blocking, but requires modification:** The `product` and `category` schemas do not currently have fields to reference a `discount` document. Adding such references would be a new feature, not a simple integration.
- **Circular Reference Risk:** Low. The proposed schema references `product` and `category`, but there is no back-reference.

## 3. Date/datetime Consistency

- **Compatible:** The `startDate` and `endDate` `datetime` fields are consistent with existing date fields like `saleStartDate` on the `product` schema. The validation logic is also consistent.

## 4. Stripe Assumptions

- **Incorrect Assumption / Blocking Conflict:** The proposed schema's `stripePromotionCodeId` field conflicts with the established pattern for handling Stripe discounts.
  - The existing `customerDiscount` object, populated via the `createCustomerDiscount` Netlify function and `stripeWebhook`, is the current abstraction for Stripe coupons and promotion codes.
  - A separate `stripePromotionCodeId` on a new `discount` document would create a parallel, conflicting system for managing Stripe promotions.

## 5. Studio UX Impact

- **High Risk of Confusion:** Introducing a new top-level `discount` document would create a fifth place for users to manage discounts, alongside products, customers, quotes, and invoices.
- **Validation Conflicts:** The validation rules in the proposed schema could conflict with existing validation on other schemas, leading to a confusing user experience.

## Summary & Recommendation

- **Compatibility Issues:**
  - **Blocking:** The proposed schema creates a direct conflict with the existing `customerDiscount` system and its tight integration with Stripe.
  - **Non-blocking but problematic:** It introduces significant semantic overlap with discount logic on `product`, `quote`/`invoice`, and `vendor` schemas, which would lead to a confusing data model and user experience.

- **Incorrect Assumptions:**
  - The proposal incorrectly assumes there is no existing abstraction for Stripe promotion codes. The `customerDiscount` object and its related workflows already serve this purpose.

- **Areas Requiring Approval:**
  - Proceeding with this schema would require a strategic decision to either deprecate or refactor all four existing discount implementations (`customer`, `product`, `quote`/`invoice`, `vendor`) to unify them under this new model.

- **Is this proposal safe to proceed to design review?**
  - **No, it is not safe to proceed.** The proposal in its current form would introduce significant technical debt, data model confusion, and a fragmented user experience. It is incompatible with the existing architecture.
