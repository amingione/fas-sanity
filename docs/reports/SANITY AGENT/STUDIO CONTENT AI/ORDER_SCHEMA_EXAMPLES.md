# Order Schema Enhancement Examples

## What "Add Descriptions" Means - Concrete Examples

This shows **exactly** what changes to make to your Order schema to help the Content Agent AI understand your business logic.

---

## Example 1: customerRef Field

### CURRENT (Your Code):
```typescript
defineField({
  name: 'customerRef',
  title: 'Customer',
  type: 'reference',
  to: [{type: 'customer'}],
  group: 'overview',
  readOnly: true,
  description: 'Click to view customer profile',  // ❌ Too vague
}),
```

### IMPROVED:
```typescript
defineField({
  name: 'customerRef',
  title: 'Customer',
  type: 'reference',
  to: [{type: 'customer'}],
  group: 'overview',
  readOnly: true,
  description: 'Reference to customer document. Auto-populated when order is created from Stripe checkout. Customer accountType (retail/wholesale) determines pricing tier. Required for order processing and CANNOT be changed after order creation.',  // ✅ Specific & helpful
}),
```

### What This Tells AI:
- ✅ Auto-populated (don't suggest manual changes)
- ✅ Links to pricing logic
- ✅ Immutable after creation
- ✅ Business-critical field

---

## Example 2: orderNumber Field

### CURRENT:
```typescript
defineField({
  name: 'orderNumber',
  title: 'Order Number',
  type: 'string',
  group: 'overview',
  readOnly: true,
  hidden: false,
  validation: (Rule) => Rule.required(),
  // ❌ NO DESCRIPTION
}),
```

### IMPROVED:
```typescript
defineField({
  name: 'orderNumber',
  title: 'Order Number',
  type: 'string',
  group: 'overview',
  readOnly: true,
  hidden: false,
  description: 'Unique human-readable order ID shown to customers in emails and on invoices. Format: FAS-YYYYMMDD-#### (e.g., FAS-20250116-0042). Auto-generated on order creation. DO NOT edit manually - used for order tracking and customer support.',  // ✅ Format + example + warning
  validation: (Rule) => Rule.required(),
}),
```

### What This Tells AI:
- ✅ Customer-facing identifier
- ✅ Exact format pattern
- ✅ Concrete example
- ✅ Critical warning about manual edits
- ✅ Business purpose (tracking, support)

---

## Example 3: status Field (MOST IMPORTANT!)

### CURRENT:
```typescript
defineField({
  name: 'status',
  title: 'Order Status',
  type: 'string',
  group: 'overview',
  hidden: false,
  options: {
    list: [
      {title: 'Pending', value: 'pending'},
      {title: 'Paid', value: 'paid'},
      {title: 'Fulfilled', value: 'fulfilled'},
      {title: 'Delivered', value: 'delivered'},
      {title: 'Canceled', value: 'canceled'},
      {title: 'Refunded', value: 'refunded'},
    ],
    layout: 'dropdown',
  },
  // ❌ NO DESCRIPTION - AI doesn't know workflow or side effects
}),
```

### IMPROVED:
```typescript
defineField({
  name: 'status',
  title: 'Order Status',
  type: 'string',
  group: 'overview',
  hidden: false,
  description: `Order fulfillment status. Controls workflow automation and customer notifications.

WORKFLOW:
• pending → paid → fulfilled → delivered (normal flow)
• pending → canceled (cancel before payment)
• paid → refunded (refund after payment)

CHANGING STATUS TRIGGERS:
- Email notifications to customer
- Inventory quantity adjustments
- Stripe payment capture/refund API calls
- EasyPost shipping label generation (when → fulfilled)

TERMINAL STATES (cannot change after):
- delivered, canceled, refunded

CAUTION: Status changes have real-world consequences. Verify before updating.`,
  options: {
    list: [
      {title: 'Pending - Awaiting Payment', value: 'pending'},
      {title: 'Paid - Payment Confirmed', value: 'paid'},
      {title: 'Fulfilled - Shipped to Customer', value: 'fulfilled'},
      {title: 'Delivered - Received by Customer', value: 'delivered'},
      {title: 'Canceled - Order Voided', value: 'canceled'},
      {title: 'Refunded - Money Returned', value: 'refunded'},
    ],
    layout: 'dropdown',
  },
}),
```

### What This Tells AI:
- ✅ Complete workflow diagram
- ✅ Side effects of changes
- ✅ Integration touchpoints (Stripe, EasyPost)
- ✅ Terminal states concept
- ✅ Warning about real-world consequences

---

## Example 4: Stripe Integration Fields

### CURRENT:
```typescript
defineField({
  name: 'stripeCheckoutId',
  title: 'Stripe Checkout ID',
  type: 'string',
  group: 'technical',
  readOnly: true,
  // ❌ NO DESCRIPTION
}),

defineField({
  name: 'stripePaymentIntentId',
  title: 'Payment Intent',
  type: 'string',
  group: 'technical',
  readOnly: true,
  // ❌ NO DESCRIPTION
}),
```

### IMPROVED:
```typescript
defineField({
  name: 'stripeCheckoutId',
  title: 'Stripe Checkout ID',
  type: 'string',
  group: 'technical',
  readOnly: true,
  description: 'Stripe Checkout Session ID (cs_xxx). Auto-populated by stripe-webhook handler on checkout.session.completed event. Links to full Stripe Checkout Session for viewing payment details, customer info, and line items. DO NOT edit - used for Stripe API lookups and refund processing.',
}),

defineField({
  name: 'stripePaymentIntentId',
  title: 'Payment Intent',
  type: 'string',
  group: 'technical',
  readOnly: true,
  description: 'Stripe Payment Intent ID (pi_xxx). Auto-populated by webhook on successful payment. Required for processing refunds via Stripe API. If missing, refunds must be processed manually in Stripe Dashboard. DO NOT edit.',
}),
```

### What This Tells AI:
- ✅ Exact ID format/prefix
- ✅ How it's populated (webhook event name)
- ✅ What it links to
- ✅ Critical for refunds
- ✅ Manual fallback if missing

---

## Example 5: Shipping Address

### CURRENT:
```typescript
defineField({
  name: 'shippingAddress',
  title: 'Shipping Address',
  type: 'object',
  group: 'fulfillment',
  fields: [
    {name: 'street', type: 'string', title: 'Street'},
    {name: 'city', type: 'string', title: 'City'},
    {name: 'state', type: 'string', title: 'State'},
    {name: 'zip', type: 'string', title: 'ZIP'},
  ],
  // ❌ NO DESCRIPTION on parent or children
}),
```

### IMPROVED:
```typescript
defineField({
  name: 'shippingAddress',
  title: 'Shipping Address',
  type: 'object',
  group: 'fulfillment',
  description: 'Validated shipping address used for EasyPost label generation and carrier rate calculations. Address must pass EasyPost validation before order can be fulfilled. Changes after label creation require creating new label (additional cost).',
  fields: [
    {
      name: 'street',
      type: 'string',
      title: 'Street Address',
      description: 'Street address including apartment/suite number. Example: "123 Main St Apt 4B"',
    },
    {
      name: 'city',
      type: 'string',
      title: 'City',
      description: 'City name. Will be validated against USPS database for US addresses.',
    },
    {
      name: 'state',
      type: 'string',
      title: 'State',
      description: 'Two-letter state code (e.g., "FL", "CA"). Required for US addresses.',
    },
    {
      name: 'zip',
      type: 'string',
      title: 'ZIP Code',
      description: 'ZIP or ZIP+4 code. Example: "33982" or "33982-1555". Determines shipping zones and rates.',
    },
  ],
}),
```

### What This Tells AI:
- ✅ Integration dependency (EasyPost)
- ✅ Validation requirements
- ✅ Cost implications of changes
- ✅ Format examples for each field
- ✅ Business impact (shipping zones/rates)

---

## How to Apply These Changes

### Option 1: Manual (Recommended)
Edit `/packages/sanity-config/src/schemaTypes/documents/order.tsx` and add `description` fields one by one.

### Option 2: AI-Assisted
1. Open the file in your code editor
2. Use Cursor/Copilot with this prompt:
   ```
   Add comprehensive description fields to this Sanity schema following these patterns:
   - Explain what the field stores
   - Note if auto-populated and by what
   - Warn about manual editing if dangerous
   - Show format with examples
   - Explain integration touchpoints
   - Describe business impact
   ```

### Option 3: Systematic
Create a checklist and tackle 5 fields per day:

**Week 1: Core Fields**
- ✅ Day 1: customerRef, orderNumber, createdAt
- ✅ Day 2: status, orderType, paymentStatus  
- ✅ Day 3: stripeCheckoutId, stripePaymentIntentId
- ✅ Day 4: shippingAddress object + all subfields
- ✅ Day 5: cartItems array + all subfields

**Week 2: Fulfillment Fields**
- Day 1: Tracking numbers, carrier info
- Day 2: Shipment details
- Day 3: Invoice references
- Day 4: Refund fields
- Day 5: Review and test with AI

---

## Testing After Adding Descriptions

### Test 1: Create an Agent
```
Prompt: "Help me understand this order's fulfillment status and next steps"
Expected: AI references status workflow, checks for tracking numbers, suggests actions
```

### Test 2: Generate Content
```
Prompt: "Write a customer service email explaining why this order is delayed"
Expected: AI mentions specific status, references tracking if available, maintains professional tone
```

### Test 3: Data Entry Assistance
```
Prompt: "What information do I need to manually create an order?"
Expected: AI lists required fields with format examples, warns about auto-populated fields
```

---

## Benefits You'll See

### Before (No Descriptions):
- ❌ AI suggests editing stripeCheckoutId manually
- ❌ AI doesn't know status change triggers webhooks
- ❌ Generic suggestions like "update the customer field"
- ❌ No understanding of workflow states

### After (With Descriptions):
- ✅ AI knows not to suggest editing Stripe fields
- ✅ AI understands status workflow and side effects
- ✅ Specific suggestions: "Since status is 'paid', next step is fulfillment"
- ✅ Contextual help: "This will trigger an email notification"

---

## Start Small

**Don't do all fields at once!** Start with these 5 critical fields:

1. **status** - Most important for workflow understanding
2. **stripeCheckoutId** - Prevents dangerous edits
3. **customerRef** - Explains pricing relationship
4. **orderNumber** - Shows format pattern
5. **shippingAddress** - Integration context

Add these 5 first, test the AI agent, see the improvement, then continue with others.

---

## Questions?

This is what "add descriptions to schemas" means. Each description:
1. Explains what the field stores
2. Shows format with examples  
3. Documents auto-population
4. Warns about manual editing risks
5. Notes integration touchpoints
6. Describes business impact

You're essentially writing documentation **inside** the schema so the AI can be a better assistant!
