# Sanity Schema Audit for AI Agent Optimization

## Overview
This document audits your Sanity schemas to identify areas where adding descriptions would improve Content Agent AI performance.

## Key Findings

### Current State
- Most schema types lack comprehensive `description` fields
- Field-level descriptions are minimal or missing
- AI agents struggle without context about data relationships
- Complex business logic (Stripe integration, EasyPost shipping) not documented in schemas

### Impact
Without rich schema descriptions:
- AI agents can't understand field purposes
- Content suggestions may be inaccurate or irrelevant
- Editors get generic help instead of domain-specific guidance
- Risk of data integrity issues when AI suggests changes

## Priority Schema Types to Document

### 1. **Product Schema**
Location: Check `packages/sanity-config/src/schemaTypes/product.ts` or similar

**Current Issues:**
- Missing description of product lifecycle
- Fitment relationships not explained
- Pricing tier logic undocumented
- Stripe product mapping unclear

**Recommended Additions:**
```typescript
export default {
  name: 'product',
  title: 'Product',
  type: 'document',
  description: 'Automotive parts and accessories with fitment data, pricing tiers, and inventory tracking. Products sync with Stripe for payment processing.',
  fields: [
    {
      name: 'title',
      title: 'Product Title',
      type: 'string',
      description: 'SEO-optimized product name. Format: [Brand] [Part Type] for [Vehicle Year-Range] [Vehicle Model]. Example: "Mishimoto Performance Radiator for 2015-2020 Mustang GT"',
    },
    {
      name: 'sku',
      title: 'SKU',
      type: 'string',
      description: 'Unique product identifier. Must match Stripe product SKU for proper order processing.',
    },
    // Add descriptions to ALL fields
  ],
}
```

### 2. **Order Schema**
**Critical for:**
- Order fulfillment workflows
- Stripe payment tracking
- EasyPost shipping label generation
- Multi-system data consistency

**Recommended:**
```typescript
description: 'Customer orders flowing through multiple fulfillment states. Syncs with Stripe for payments and EasyPost for shipping labels. DO NOT manually edit Stripe-managed fields.',
```

### 3. **Customer Schema**
**Important for:**
- Customer segmentation (retail vs wholesale)
- Vehicle ownership tracking
- Order history analysis
- Marketing automation

**Recommended:**
```typescript
description: 'Customer accounts with purchase history, vehicles, and pricing tier. Wholesale customers have special pricing and payment terms.',
```

### 4. **Invoice Schema**
**Critical for:**
- Wholesale billing
- Payment tracking
- Financial reporting
- Stripe integration

### 5. **Shipment Schema**
**Critical for:**
- EasyPost integration
- Tracking number management
- Shipping status updates

## Schema Enhancement Template

Use this template for all schema types:

```typescript
export default {
  name: 'schemaName',
  title: 'Human Readable Title',
  type: 'document',
  description: `
[1-2 sentences about what this document represents]
[Key business rules or constraints]
[Integration points with external systems]
[Warning about critical fields that shouldn't be manually edited]
  `.trim(),
  fields: [
    {
      name: 'fieldName',
      title: 'Field Title',
      type: 'string',
      description: `
[What this field represents]
[Format requirements or examples]
[Relationship to other fields/systems]
[Any validation rules]
      `.trim(),
      validation: Rule => Rule.required(),
    },
  ],
}
```

## Specific Recommendations by Schema

### Order Fields That Need Descriptions

```typescript
{
  name: 'stripeCheckoutId',
  description: 'Stripe Checkout Session ID. Auto-populated by webhook. DO NOT edit manually.',
},
{
  name: 'stripePaymentIntentId',  
  description: 'Stripe Payment Intent ID for this order. Links to payment details and refund capabilities.',
},
{
  name: 'status',
  description: 'Order fulfillment status. Workflow: NEW → Processing → Fulfilled → Completed. "Cancelled" and "Refunded" are terminal states.',
},
{
  name: 'customer',
  description: 'Reference to customer document. Must exist before order creation. Determines pricing tier.',
},
{
  name: 'shippingAddress',
  description: 'Validated shipping address. Used for EasyPost label generation and carrier rate calculations.',
},
```

### Product Fields That Need Descriptions

```typescript
{
  name: 'price',
  description: 'Retail price in USD. For wholesale customers, see wholesalePrice field.',
},
{
  name: 'wholesalePrice',
  description: 'Wholesale pricing for verified business customers. Leave empty if product not available wholesale.',
},
{
  name: 'stripeProductId',
  description: 'Stripe Product ID. Auto-synced via webhook. DO NOT edit unless re-linking to Stripe.',
},
{
  name: 'stripePriceId',
  description: 'Stripe Price ID for this product. Maps to payment processing.',
},
{
  name: 'inventory',
  description: 'Current stock quantity. Updates automatically on order fulfillment. Set to -1 for unlimited stock.',
},
```

### Customer Fields That Need Descriptions

```typescript
{
  name: 'accountType',
  description: 'Customer tier: "retail" (standard pricing) or "wholesale" (discounted pricing, net-30 terms).',
},
{
  name: 'stripeCustomerId',
  description: 'Stripe Customer ID. Auto-created on first purchase. Links payment methods and order history.',
},
{
  name: 'vehicles',
  description: 'Array of owned vehicles. Used for fitment recommendations and purchase history analysis.',
},
{
  name: 'totalSpent',
  description: 'Lifetime value in USD. Auto-calculated from order history. Read-only field.',
},
```

## Implementation Steps

### Step 1: Audit Current Schemas
```bash
# Find all schema files
cd /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-sanity
find packages/sanity-config/src/schemaTypes -name "*.ts" -type f
```

### Step 2: Add Descriptions Systematically

Priority order:
1. **Core commerce schemas**: product, order, customer, invoice
2. **Integration schemas**: shipment, payment, refund
3. **Content schemas**: page, post, category
4. **Supporting schemas**: vehicle, appointment, workOrder

### Step 3: Test with AI Agent

After adding descriptions:
1. Restart Sanity Studio: `pnpm dev`
2. Open any document type
3. Try creating an agent: "Help me write product descriptions"
4. Verify agent understands field purposes

### Step 4: Iterate Based on Usage

Monitor:
- Are AI suggestions accurate?
- Do editors understand generated content?
- Are critical fields being modified incorrectly?

## Best Practices for Schema Descriptions

### ✅ DO:
- Explain field purpose in business terms
- Document relationships to external systems
- Provide format examples
- Warn about auto-populated fields
- Describe validation rules
- Explain impact on other parts of system

### ❌ DON'T:
- Write vague descriptions like "The title field"
- Skip critical integration points
- Assume technical knowledge
- Forget about content editors
- Leave validation undocumented

## Example: Well-Documented Schema

```typescript
export default {
  name: 'order',
  title: 'Order',
  type: 'document',
  description: `
Customer orders with integrated Stripe payment and EasyPost shipping.
Orders flow through statuses: NEW → Processing → Fulfilled → Completed.
CRITICAL: Stripe fields (IDs, payment status) are auto-synced by webhooks.
Manual edits to Stripe-related fields can break payment reconciliation.
  `.trim(),
  fields: [
    {
      name: 'orderNumber',
      title: 'Order Number',
      type: 'string',
      description: `
Human-friendly order identifier displayed to customers.
Format: FAS-YYYYMMDD-#### (e.g., FAS-20250116-0042)
Auto-generated on order creation. DO NOT edit manually.
      `.trim(),
      validation: Rule => Rule.required(),
    },
    {
      name: 'customer',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      description: `
Reference to customer document. Required for order processing.
Customer account type (retail/wholesale) determines pricing.
Customer address book used for shipping address auto-fill.
      `.trim(),
      validation: Rule => Rule.required(),
    },
    {
      name: 'status',
      title: 'Order Status',
      type: 'string',
      options: {
        list: [
          {title: 'New', value: 'NEW'},
          {title: 'Processing', value: 'Processing'},
          {title: 'Fulfilled', value: 'Fulfilled'},
          {title: 'Completed', value: 'Completed'},
          {title: 'Cancelled', value: 'Cancelled'},
          {title: 'Refunded', value: 'Refunded'},
        ],
      },
      description: `
Current order fulfillment status. Drives automation workflows.

Status Flow:
- NEW: Just created, awaiting payment confirmation
- Processing: Payment confirmed, ready for fulfillment  
- Fulfilled: Shipped with tracking number
- Completed: Delivered to customer (terminal state)
- Cancelled: Order cancelled before fulfillment (terminal state)
- Refunded: Full refund issued (terminal state)

Changing status may trigger email notifications and inventory updates.
      `.trim(),
      initialValue: 'NEW',
      validation: Rule => Rule.required(),
    },
    // ... more fields with detailed descriptions
  ],
  preview: {
    select: {
      title: 'orderNumber',
      subtitle: 'customer.name',
      status: 'status',
    },
    prepare({title, subtitle, status}) {
      return {
        title: title || 'Order',
        subtitle: `${subtitle || 'Unknown'} - ${status}`,
      }
    },
  },
}
```

## Quick Wins

Start with these high-impact changes:

1. **Add schema-level descriptions** to top 10 document types
2. **Document Stripe fields** everywhere they appear
3. **Explain status/state fields** with workflow diagrams
4. **Clarify reference fields** with relationship explanations
5. **Add format examples** to string fields

## Measuring Success

After implementation, you should see:
- ✅ More accurate AI-generated content
- ✅ Fewer editor questions about field purposes
- ✅ Reduced data integrity issues
- ✅ Faster content creation
- ✅ Better onboarding for new editors

## Next Steps

1. **Review this audit** with your team
2. **Prioritize schemas** based on usage frequency
3. **Assign schema documentation** tasks
4. **Test AI agents** after each update
5. **Gather feedback** from content editors
6. **Iterate and improve** descriptions over time

## Resources

- [Sanity Schema Documentation](https://www.sanity.io/docs/schema-types)
- [Field Descriptions Best Practices](https://www.sanity.io/docs/schema-types#field-descriptions)
- [Content Modeling Guide](https://www.sanity.io/docs/content-modeling)
