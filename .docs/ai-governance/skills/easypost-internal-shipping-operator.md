# Skill: EasyPost Internal Shipping Operator (fas-sanity)

## Scope

Applies to internal/admin shipping flows in fas-sanity (manually created invoices, fulfillment,
manual label purchase).

### Core Rules

- EasyPost provides dynamic live rates for internal/admin shipments.
- Multiple carrier services must always be available | \*Examples **(but not limited to)\***:(`ground`, `2nd day`, `next day`).
- Shipping labels are purchased manually by staff using EasyPost.
- Do not create Stripe Checkout sessions or configure Stripe shipping options using EasyPost.
- **Do not reference Parcelcraft in fas-sanity _unless_ creating or editing _stripe function_ documents that relate to _fas-cms-fresh_ (storefront https://www.fasmotorsports.com).**

#### Failure Mode

If a request conflicts with these rules, stop and request explicit human
approval before taking action.
