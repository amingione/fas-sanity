# Claude AI Assistant Guide - FAS Motorsports

**Version:** 1.2.1
**Last Updated:** 2025-12-26
**For:** Claude Code, Cursor, and other AI assistants

> **📖 Full Documentation:** See [codex.md](./codex.md) for comprehensive patterns, examples, and integration details.

---

## Quick Reference

### Project Structure

```
~/projects/
├── fas-sanity/          # THIS REPO - Sanity Studio, schemas, business logic
└── fas-cms-fresh/       # Astro frontend, API routes, UI (local clone of fas-cms)
```

**Important:** GitHub repo is `fas-cms`, but local directory is `fas-cms-fresh`.

### Local Paths

- **fas-sanity:** `/Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-sanity`
- **fas-cms-fresh:** `/Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-cms-fresh`

---

## Core Principles

## 🚨 Architecture Authority (Non‑Negotiable)

This system operates under a **Medusa‑first commerce model**.

- **Medusa** is the single source of truth for:
  products, variants, pricing, inventory, cart, checkout, orders, shipping.
- **Sanity** is content‑only and record‑keeping only:
  product content, media, SEO, and non‑authoritative order records.
- **Stripe and Shippo are accessed exclusively via Medusa.**
- **fas‑cms‑fresh consumes Medusa APIs and renders UI only.**

If any rule below conflicts with this section, **this section overrides it**.

### 1. Schema-First Development ⭐

- Sanity schemas are authoritative for **content and record storage only**
- Commerce data structures originate in Medusa
- API routes must match Sanity schema types exactly
- Never invent fields that don't exist in schemas
- **ALWAYS check the schema first before making changes**

### 2. Minimal Change Philosophy 🎯

- Make the smallest possible change to achieve correctness
- Do NOT refactor, rename, or reformat unrelated code
- Preserve existing behavior unless provably incorrect
- If a change would affect unlisted files, STOP and report it

### 3. Sync Enforcement 🔄

- Schema changes → API/frontend updates required
- All three layers (schema → API → UI) must stay in sync
- Test across the full stack before considering changes complete

### 4. Data Integrity ✅

- Medusa order totals are authoritative; Sanity stores a non‑authoritative snapshot
- No undefined or null fields in created documents
- All references must resolve to valid documents

### 5. Provider Metadata Rule

- Do NOT add new Stripe/Shippo/carrier-specific metadata fields to schemas without approval
- Existing provider fields are **allowed** as non-authoritative operational metadata:
  `stripeSessionId`, `stripePaymentIntentId`, `paymentIntentId`,
  `shippoRateId`, `shippoShipmentId`, `shippoTrackerId`, `stripeSummary.data`
- Provider-specific details remain non-authoritative; re-fetch from provider APIs when needed
- Raw provider payloads may be stored ONLY as opaque JSON for audit purposes

### Wholesale Workflow State

- Wholesale workflow state lives ONLY at `wholesaleDetails.workflowStatus`
- Do NOT introduce top-level wholesale workflow fields
- Do NOT duplicate wholesale workflow state
- Top-level `status` represents the order lifecycle, not the wholesale lifecycle

---

## Critical Files & Patterns

### Key Schema Files (fas-sanity)

```
schemas/
├── index.ts              # Schema registry
├── order.tsx            # ⚠️ TSX not TS! Order document (most complex)
├── orderCartItem.ts     # Cart item structure
├── product.ts           # Product catalog
├── customer.ts          # Customer/user data
└── vendor.ts            # Vendor accounts
```

### Key API Routes (fas-cms-fresh)

```
src/pages/api/
├── shipping/
│   └── rates.ts         # shipping rates
└── military-verify/
    ├── start.ts         # Military verification start
    └── check-status.ts  # Verification status check
```


⚠️ NOTE:
Orders are CREATED and VALIDATED in Medusa.
Sanity order documents are downstream records and must never be treated
as a pricing, tax, or shipping authority.

```
2. Stripe → webhooks.ts → Verify signature
3. webhooks.ts → createOrderFromSession() → Sanity order document
4. ✅ Order created in Sanity
```

**Critical:** Order creation happens in `webhooks.ts`, NOT in a separate utility file.

---

## Order Schema - Critical Fields

**File:** `fas-sanity/schemas/order.tsx` (⚠️ TSX file, contains React components)

These fields represent a **persisted snapshot** of a Medusa order.
They must exactly mirror Medusa output but must never be used to
re‑compute prices, taxes, shipping, or payment state.

### Required Fields for Order Creation

```typescript
{
  _type: 'order',
  orderNumber: string,           // Format: 'FAS-######'
  createdAt: datetime,
  status: 'pending' | 'paid' | 'fulfilled' | 'delivered' | 'canceled' | 'refunded',
  orderType: 'online' | 'retail' | 'wholesale' | 'in-store' | 'phone',
  paymentStatus: 'pending' | 'unpaid' | 'paid' | 'failed' | 'refunded' | 'partially_refunded' | 'cancelled',

  // Customer info
  customerRef: reference,        // Optional reference to customer doc
  customerName: string,
  customerEmail: string,

  // Cart
  cart: orderCartItem[],         // Array of cart items

  // Amounts (ALL in dollars, not cents)
  amountSubtotal: number,
  amountTax: number,
  amountShipping: number,
  amountDiscount: number,
  totalAmount: number,           // subtotal + tax + shipping - discount

  // Addresses
  shippingAddress: object,       // From session.shipping_details.address
  billingAddress: object,        // From session.customer_details.address

  // Stripe data
  currency: string,
  stripeSessionId: string,
  stripePaymentIntentId: string,
  paymentIntentId: string,       // Same as stripePaymentIntentId

  // Stripe summary (MUST be object, not array)
  stripeSummary: {
    data: string                 // JSON.stringify(session)
  }
}
```

### Order Cart Item Structure

```typescript
{
  _type: 'orderCartItem',        // CRITICAL: Must be exact
  _key: string,                  // Unique key (timestamp-random)
  productId: string,             // Sanity product ID
  productName: string,
  sku: string,
  quantity: number,
  price: number,                 // Final line price (includes upgrades)
  unitPrice: number,             // Base unit price
  options: string,               // Variant selection
  upgrades: string[],            // Array of upgrade names/prices
  imageUrl: url,
  // Non-authoritative caches (debugging only):
  stripePriceId?: string,
  stripeProductId?: string
}
```

### Order Status Semantics

- `order.status` tracks fulfillment readiness (not payment outcome).
- Payment outcome nuances live in `paymentStatus`.
- Webhook collapses non-paid outcomes to `pending` by design (see ADR-0001).

---

## Stripe → Sanity Field Mappings

**⚠️ All Stripe amounts are in CENTS - divide by 100 before storing in Sanity**

| Stripe Field                            | Sanity Field            | Transform            |
| --------------------------------------- | ----------------------- | -------------------- |
| `session.id`                            | `stripeSessionId`       | Direct               |
| `session.payment_intent`                | `stripePaymentIntentId` | Direct (as string)   |
| `session.payment_intent`                | `paymentIntentId`       | Alias (keep in sync) |
| `session.amount_subtotal`               | `amountSubtotal`        | **÷ 100**            |
| `session.amount_total`                  | `totalAmount`           | **÷ 100**            |
| `session.total_details.amount_tax`      | `amountTax`             | **÷ 100**            |
| `session.total_details.amount_shipping` | `amountShipping`        | **÷ 100**            |
| `session.total_details.amount_discount` | `amountDiscount`        | **÷ 100**            |
| `session.payment_status`                | `paymentStatus`         | Direct               |
| `session.shipping_details.address`      | `shippingAddress`       | Object map           |
| `session.customer_details.address`      | `billingAddress`        | Object map           |

### Canonical Fields (Duplicates)

- `stripePaymentIntentId` is canonical; `paymentIntentId` is a legacy alias.
- `carrier` and `service` live on the top-level order document; legacy `fulfillmentDetails.*` values are deprecated.

**Address Mapping Example:**

```typescript
// Shipping address - use shipping_details.address
shippingAddress: session.shipping_details?.address
  ? {
      name: session.shipping_details.name || '',
      phone: session.customer_details?.phone || '',
      email: session.customer_details?.email || '',
      addressLine1: session.shipping_details.address.line1 || '',
      addressLine2: session.shipping_details.address.line2 || '',
      city: session.shipping_details.address.city || '',
      state: session.shipping_details.address.state || '',
      postalCode: session.shipping_details.address.postal_code || '',
      country: session.shipping_details.address.country || '',
    }
  : undefined
```

---

## Change Control Rules

### ✅ ALLOWED (No Approval Needed)

- Fix bugs in calculations (e.g., order total math)
- Add missing fields to match schema
- Correct type mismatches (string vs number)
- Add validation to prevent bad data
- Improve error handling
- Add logging/debugging
- Update comments/documentation

### ⚠️ REQUIRES APPROVAL (Ask First)

- Add new document types
- Remove existing fields from `order.tsx`
- Change field types (string → number)
- Modify business logic (pricing, discounts)
- Change API endpoints or contracts
- Alter authentication flow
- Modify webhook handling

### ❌ FORBIDDEN (Never Do)

- Delete production data
- Expose secrets in code
- Remove error handling
- Break existing API contracts
- Change Stripe product IDs
- Modify completed order data
- Bypass authentication
- Rename `order.tsx` to `order.ts` (it's TSX for a reason!)

---

## Working with This Project

### Before Making Changes

1. **Read the schema first** - `fas-sanity/schemas/[documentType].ts(x)`
2. **Check codex.md** - [codex.md](./codex.md) for detailed patterns
3. **Identify affected files** - Schema → API → Frontend
4. **Plan minimal changes** - What's the smallest fix?
5. **Ask if unsure** - Better to clarify than break things

### When Adding/Modifying Fields

```typescript
// 1. Update schema (fas-sanity/schemas/order.tsx)
{
  name: 'newField',
  title: 'New Field',
  type: 'string',
  group: 'overview', // or 'fulfillment', 'documents', 'technical'
  validation: Rule => Rule.required()
}

// 2. Update webhook handler (fas-cms-fresh/src/pages/api/webhooks.ts)
const order = await sanityClient.create({
  _type: 'order',
  newField: 'value', // Add here
  // ... other fields
})

// 3. Update frontend queries (if needed)
const query = `*[_type == "order"]{
  _id,
  newField,
  ...
}`
```

### Common Mistakes to Avoid

❌ **Don't do this:**

```typescript
// Wrong: Stripe amounts in cents
totalAmount: session.amount_total

// Wrong: Missing _type
cart: [
  {
    productName: 'Product',
    price: 100,
  },
]

// Wrong: stripeSummary as array
stripeSummary: [{data: '...'}]
```

✅ **Do this:**

```typescript
// Correct: Convert to dollars
totalAmount: (session.amount_total || 0) / 100

// Correct: Include _type and _key
cart: [{
  _type: 'orderCartItem',
  _key: generateKey(),
  productName: 'Product',
  price: 100
}]

// Correct: stripeSummary as object
stripeSummary: {
  data: JSON.stringify(session),
  paymentCaptured: true,
  webhookNotified: true
}
```

---

## Environment Variables

### fas-sanity (.env)

```bash
SANITY_STUDIO_PROJECT_ID=your_project_id
SANITY_STUDIO_DATASET=production
SANITY_STUDIO_API_VERSION=2024-01-01
SANITY_API_TOKEN=skxxx
```

### fas-cms-fresh (.env.local)

```bash
SANITY_STUDIO_PROJECT_ID=your_project_id
SANITY_STUDIO_DATASET=production
SANITY_API_TOKEN=skxxx
STRIPE_SECRET_KEY=<real_api_key>
SANITY_STUDIO_STRIPE_PUBLISHABLE_KEY=<publishable_key>
STRIPE_WEBHOOK_SECRET=whsec_xxx
SHIPPO_API_KEY=EZAK_xxx
```

---

## Testing Checklist

Before committing changes:

- [ ] TypeScript type check: `npm run type-check`
- [ ] Sanity Studio loads without errors
- [ ] No browser console errors
- [ ] Test with Stripe test mode
- [ ] Verify existing documents still load
- [ ] Check that totals calculate correctly
- [ ] Confirm schema → API → UI alignment

---

## Quick Diagnosis Template

When investigating issues:

```
PROBLEM: [What is broken?]
ROOT CAUSE: [Why is it happening?]
AFFECTED FILES:
  - fas-sanity/schemas/...
  - fas-cms-fresh/src/pages/api/...
SOLUTION: [Minimal fix]
VALIDATION: [How to verify it works]
```

---

## Helpful Commands

```bash
# Type checking
npm run type-check

# Sanity Studio (fas-sanity)
npm run dev          # Start Studio on localhost:3333
npm run deploy       # Deploy Studio

# Frontend (fas-cms-fresh)
npm run dev          # Start Astro on localhost:4321
npm run build        # Build production bundle

# Stripe CLI (webhook testing)
stripe listen --forward-to localhost:4321/api/webhooks
```

---

## API Versions

- **Stripe:** `2024-11-20` (apiVersion in code)
- **Sanity:** `2024-01-01` (apiVersion for queries/mutations)
- **Shippo:** Latest (no version pinning)

---

## Getting Help

1. **Check codex.md first** - [codex.md](./codex.md)
2. **Review schema files** - They're the source of truth
3. **Look for similar patterns** - In webhooks.ts, checkout.ts, etc.
4. **Ask before breaking things** - Better safe than sorry

---

## Remember

- Medusa is king 👑 — commerce truth lives there
- Sanity stores content and historical records only
- **Minimal changes** 🎯 - Don't over-engineer or refactor unnecessarily
- **Test thoroughly** ✅ - Especially order creation and totals
- **When in doubt, ask** 💬 - Clarify before making assumptions

---

**Last Updated:** 2025-12-26
**Maintained by:** Amber Min (ambermin)
**For questions:** See [codex.md](./codex.md) or ask the team
