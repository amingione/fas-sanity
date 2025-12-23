AUTHORITATIVE LOCATION:
This Codex is authoritative for ALL FAS repositories.
Any copies elsewhere are references only.

IMPORTANT:
This document is binding. Codex must follow it before performing any task.
Failure to do so invalidates the task.

FAS Motorsports Codex Master Prompt
Version: 1.1.0
Last Updated: 2025-12-23
Repos: fas-sanity, fas-cms-fresh

Overview
You have trusted read/write access to the following repositories:

fas-sanity — Sanity Studio, schemas, plugins, webhooks, business logic
fas-cms-fresh — Astro/React frontend, API routes, queries, UI components
This document defines the rules, patterns, and constraints for making changes across both repos while maintaining data integrity, type safety, and business logic consistency.

Core Principles

1. Schema-First Development
   All data structures originate in fas-sanity/schemas/
   API routes in fas-cms-fresh must match Sanity schema types exactly
   Frontend components consume typed data from GROQ queries
   Never invent fields that don't exist in schemas
2. Minimal Change Philosophy
   Make the smallest possible change to achieve correctness
   Do NOT refactor, rename, or reformat unrelated code
   Preserve existing behavior unless provably incorrect
   If a change would affect unlisted files, STOP and report it
3. Sync Enforcement
   Schema changes require corresponding API/frontend updates
   API changes must validate against current schemas
   Frontend changes must use existing API contracts
   All three layers (schema → API → UI) must stay in sync
4. Data Integrity
   Stripe totals must match Sanity order totals
   No undefined or null fields in created documents
   Existing documents must not break due to changes
   All references must resolve to valid documents
   Repository Structure
   fas-sanity
   fas-sanity/
   ├── schemas/
   │ ├── index.ts # Schema registry
   │ ├── order.tsx # Order document type (TSX!)
   │ ├── product.ts # Product document type
   │ ├── customer.ts # Customer document type
   │ ├── vendor.ts # Vendor document type
   │ ├── invoice.ts # Invoice document type
   │ ├── shippingLabel.ts # EasyPost shipping labels
   │ └── [other schemas]
   ├── components/ # Custom Studio components
   ├── lib/
   │ └── stripe-order.ts # Stripe order completion utilities
   ├── plugins/ # Studio plugins
   └── sanity.config.ts # Studio configuration
   fas-cms-fresh
   fas-cms-fresh/
   ├── src/
   │ ├── pages/
   │ │ └── api/ # Astro API routes
   │ │ ├── checkout.ts # Stripe checkout creation
   │ │ ├── webhooks.ts # Stripe webhook handler
   │ │ ├── shipping/
   │ │ │ └── rates.ts # EasyPost rate fetching
   │ │ └── military-verify/
   │ │ ├── start.ts # Military verification
   │ │ └── check-status.ts
   │ ├── lib/
   │ │ ├── sanity.ts # Sanity client config
   │ │ ├── easypost.ts # EasyPost client config
   │ │ ├── auth.ts # Auth utilities
   │ │ └── session.ts # Session management
   │ ├── components/ # React/Astro components
   │ └── types/ # TypeScript types
   └── astro.config.mjs
   IMPORTANT:

No stripe.ts file exists - Stripe is imported directly in API routes
Order schema is order.tsx (TSX, not TS)
Webhook handler is webhooks.ts (not in subfolder)
Stripe order utilities live in fas-sanity/lib/stripe-order.ts
Integration Points

1. Stripe Integration
   Checkout Flow:

Customer → fas-cms-fresh/api/checkout.ts → Stripe Checkout Session → Stripe Webhook → fas-cms-fresh/api/webhooks.ts → fas-sanity/lib/stripe-order.ts → Sanity Order Document
Key Files:

fas-cms-fresh/src/pages/api/checkout.ts — Create checkout sessions (imports Stripe directly)
fas-cms-fresh/src/pages/api/webhooks.ts — Handle Stripe webhook events
fas-sanity/lib/stripe-order.ts — Order creation utilities (used by webhook)
fas-sanity/schemas/order.tsx — Order document schema (TSX!)
Checkout Session Creation Pattern:

// fas-cms-fresh/src/pages/api/checkout.ts
import Stripe from 'stripe'
import { readSession } from '@/lib/session'

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY!, {
apiVersion: '2024-11-20.acacia'
})

export const POST: APIRoute = async ({ request }) => {
const { cart } = await request.json()

// Validate cart
if (!cart || cart.length === 0) {
return new Response(
JSON.stringify({ error: 'Cart is empty' }),
{ status: 400 }
)
}

// Get user session
const session = await readSession(request)
const userId = session?.userId
const userEmail = session?.userEmail

// Map cart to Stripe line items
const lineItems = cart.map(item => ({
price_data: {
currency: 'usd',
product_data: {
name: item.productName,
images: item.imageUrl ? [item.imageUrl] : [],
metadata: {
sanity_product_id: item.productId,
sku: item.sku,
options: item.options || '',
upgrades: JSON.stringify(item.upgrades || [])
}
},
unit_amount: Math.round(item.price \* 100) // Price in cents
},
quantity: item.quantity
}))

// Create checkout session
const checkoutSession = await stripe.checkout.sessions.create({
mode: 'payment',
line_items: lineItems,

    // Metadata for webhook
    metadata: {
      customer_id: userId || '',
      customer_email: userEmail || '',
      order_type: 'retail', // or 'wholesale'
      cart_data: JSON.stringify(cart) // Compact cart for reference
    },

    // Enable tax and shipping
    automatic_tax: { enabled: true },
    shipping_address_collection: {
      allowed_countries: ['US']
    },
    shipping_options: [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 0, currency: 'usd' },
          display_name: 'Free shipping',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 5 },
            maximum: { unit: 'business_day', value: 7 }
          }
        }
      }
    ],

    // URLs
    success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/cart`

})

return new Response(
JSON.stringify({ url: checkoutSession.url }),
{ status: 200 }
)
}
Webhook Handler Pattern:

// fas-cms-fresh/src/pages/api/webhooks.ts
import Stripe from 'stripe'
import { createOrderFromStripeSession } from 'fas-sanity/lib/stripe-order'

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY!)

export const POST: APIRoute = async ({ request }) => {
const body = await request.text()
const sig = request.headers.get('stripe-signature')!

let event: Stripe.Event

try {
// Verify webhook signature
event = stripe.webhooks.constructEvent(
body,
sig,
import.meta.env.STRIPE_WEBHOOK_SECRET!
)
} catch (err) {
console.error('Webhook signature verification failed:', err)
return new Response('Webhook Error', { status: 400 })
}

// Handle events
switch (event.type) {
case 'checkout.session.completed': {
const session = event.data.object as Stripe.Checkout.Session

      // Retrieve full session with line items
      const fullSession = await stripe.checkout.sessions.retrieve(
        session.id,
        { expand: ['line_items.data.price.product'] }
      )

      // Create order in Sanity (uses fas-sanity utility)
      await createOrderFromStripeSession(fullSession)

      break
    }

    case 'payment_intent.succeeded': {
      // Handle payment confirmation
      break
    }

    case 'charge.refunded': {
      // Handle refunds
      break
    }

}

return new Response(JSON.stringify({ received: true }), { status: 200 })
}
Order Creation Utility Pattern:

// fas-sanity/lib/stripe-order.ts
import { createClient } from '@sanity/client'
import type Stripe from 'stripe'

const sanityClient = createClient({
projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
dataset: process.env.SANITY_STUDIO_DATASET!,
token: process.env.SANITY_API_TOKEN!,
apiVersion: '2024-01-01',
useCdn: false
})

export async function createOrderFromStripeSession(
session: Stripe.Checkout.Session
) {
const lineItems = session.line_items?.data || []

// Map line items to cart format
const cart = lineItems.map(item => {
const product = item.price?.product as Stripe.Product
const metadata = product.metadata || {}

    return {
      _type: 'orderCartItem',
      _key: generateKey(),
      productId: metadata.sanity_product_id || null,
      productName: item.description || product.name,
      sku: metadata.sku || null,
      quantity: item.quantity || 1,
      price: (item.amount_total || 0) / 100,
      unitPrice: (item.price?.unit_amount || 0) / 100,
      options: metadata.options || null,
      upgrades: metadata.upgrades ? JSON.parse(metadata.upgrades) : [],
      imageUrl: product.images?.[0] || null
    }

})

// Extract addresses
const shippingAddress = session.shipping_details?.address
const customerDetails = session.customer_details

// Create order document
const order = await sanityClient.create({
\_type: 'order',
orderNumber: `FAS-${Date.now().toString().slice(-6)}`,
createdAt: new Date().toISOString(),

    // Status fields
    status: 'paid',
    orderType: session.metadata?.order_type || 'retail',
    paymentStatus: session.payment_status,

    // Customer info
    customerName: customerDetails?.name || '',
    customerEmail: customerDetails?.email || '',
    customerRef: session.metadata?.customer_id ? {
      _type: 'reference',
      _ref: session.metadata.customer_id
    } : undefined,

    // Cart
    cart: cart,

    // Amounts
    amountSubtotal: (session.amount_subtotal || 0) / 100,
    amountTax: (session.total_details?.amount_tax || 0) / 100,
    amountShipping: (session.total_details?.amount_shipping || 0) / 100,
    totalAmount: (session.amount_total || 0) / 100,
    amountDiscount: (session.total_details?.amount_discount || 0) / 100,

    // Addresses
    shippingAddress: shippingAddress ? {
      name: session.shipping_details?.name || '',
      phone: customerDetails?.phone || '',
      email: customerDetails?.email || '',
      addressLine1: shippingAddress.line1 || '',
      addressLine2: shippingAddress.line2 || '',
      city: shippingAddress.city || '',
      state: shippingAddress.state || '',
      postalCode: shippingAddress.postal_code || '',
      country: shippingAddress.country || ''
    } : undefined,

    billingAddress: customerDetails?.address ? {
      name: customerDetails.name || '',
      phone: customerDetails.phone || '',
      email: customerDetails.email || '',
      addressLine1: customerDetails.address.line1 || '',
      addressLine2: customerDetails.address.line2 || '',
      city: customerDetails.address.city || '',
      state: customerDetails.address.state || '',
      postalCode: customerDetails.address.postal_code || '',
      country: customerDetails.address.country || ''
    } : undefined,

    // Stripe data
    currency: session.currency,
    stripeSessionId: session.id,
    stripePaymentIntentId: session.payment_intent as string,

    // Stripe summary
    stripeSummary: {
      data: JSON.stringify(session),
      paymentCaptured: session.payment_status === 'paid',
      paymentCapturedAt: session.payment_status === 'paid'
        ? new Date().toISOString()
        : undefined,
      webhookNotified: true
    }

})

return order
}

function generateKey() {
return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}
Rules:

Line items must include: base price + addOns/upgrades in metadata
Metadata must include: sanity_product_id, customer_id, order_type
Webhook must create order with complete cart data
Totals: amountSubtotal + amountShipping + amountTax = totalAmount
All amounts stored in dollars (not cents) in Sanity
Stripe amounts divided by 100 before storing 2. EasyPost Integration
Shipping Flow:

Customer enters address → fas-cms-fresh/api/shipping/rates.ts → EasyPost API → Return rates → Customer selects → Stored in checkout session
Key Files:

fas-cms-fresh/src/lib/easypost.ts — EasyPost client
fas-cms-fresh/src/pages/api/shipping/rates.ts — Fetch shipping rates
fas-cms-fresh/src/pages/api/shipping/create-label.ts — Create shipping labels
fas-sanity/schemas/shippingLabel.ts — Label tracking schema
Rules:

Always validate addresses before rate calculation
Store EasyPost shipment ID in easyPostShipmentId field
Track label URLs in shippingLabelUrl field
Store tracking numbers in trackingNumber field
Handle rate errors gracefully 3. Sanity Integration
Data Flow:

fas-cms-fresh → GROQ Query → Sanity API → Typed Response → Component Render
fas-cms-fresh → API Mutation → Sanity Client → Document Create/Update → Webhook (optional)
Key Files:

fas-cms-fresh/src/lib/sanity.ts — Client configuration
fas-sanity/schemas/_.ts(x) — All document schemas
fas-cms-fresh/src/pages/api/_ — Server-side mutations
Rules:

Use apiVersion: '2024-01-01' consistently
Server-side: use token for write access
Client-side: use CDN for read-only queries
Always project only needed fields in GROQ 4. Authentication
Auth Flow:

User Login → Auth Provider → Session Token → API Routes (validate) → Sanity Queries (filtered by user)
Key Files:

fas-cms-fresh/src/lib/auth.ts — Auth utilities
fas-cms-fresh/src/lib/session.ts — Session management (readSession)
fas-cms-fresh/src/middleware.ts — Route protection
fas-sanity/schemas/customer.ts — Customer/user data
fas-sanity/schemas/vendor.ts — Vendor accounts
Rules:

Protect all API routes that mutate data
Filter queries by user permissions
Store user ID in session, not sensitive data
Vendors see only their orders/data
Schema Patterns
Order Schema (order.tsx)
CRITICAL: This is the actual schema structure from your repo

// fas-sanity/schemas/order.tsx

export default {
name: 'order',
type: 'document',
title: 'Order',
groups: [
{ name: 'overview', title: 'Overview', default: true },
{ name: 'fulfillment', title: 'Fulfillment' },
{ name: 'documents', title: 'Documents' },
{ name: 'technical', title: 'Technical' }
],
fields: [
// OVERVIEW GROUP
{
name: 'customerRef',
type: 'reference',
to: [{ type: 'customer' }],
group: 'overview'
},
{
name: 'orderHeaderDisplay',
type: 'string',
// Custom input component
group: 'overview'
},
{
name: 'orderNumber',
type: 'string',
group: 'overview'
},
{
name: 'createdAt',
type: 'datetime',
group: 'overview'
},
{
name: 'status',
type: 'string',
options: {
list: [
{ title: 'Pending', value: 'pending' },
{ title: 'Paid', value: 'paid' },
{ title: 'Cancelled', value: 'cancelled' },
{ title: 'Refunded', value: 'refunded' }
]
},
group: 'overview'
},
{
name: 'orderType',
type: 'string',
options: {
list: [
{ title: 'Retail', value: 'retail' },
{ title: 'Wholesale', value: 'wholesale' }
]
},
group: 'overview'
},
{
name: 'paymentStatus',
type: 'string',
options: {
list: [
{ title: 'Pending', value: 'pending' },
{ title: 'Paid', value: 'paid' },
{ title: 'Failed', value: 'failed' },
{ title: 'Refunded', value: 'refunded' }
]
},
group: 'overview'
},
{
name: 'customerName',
type: 'string',
group: 'overview'
},
{
name: 'customerEmail',
type: 'string',
group: 'overview'
},
{
name: 'cart',
type: 'array',
of: [{ type: 'orderCartItem' }],
group: 'overview'
},
{
name: 'totalAmount',
type: 'number',
group: 'overview'
},
{
name: 'amountSubtotal',
type: 'number',
group: 'overview'
},
{
name: 'amountTax',
type: 'number',
group: 'overview'
},
{
name: 'amountShipping',
type: 'number',
group: 'overview'
},
{
name: 'amountDiscount',
type: 'number',
group: 'overview'
},
{
name: 'invoiceRef',
type: 'reference',
to: [{ type: 'invoice' }],
group: 'overview'
},

    // FULFILLMENT GROUP
    {
      name: 'fulfillmentDetails',
      type: 'object',
      fields: [
        { name: 'status', type: 'string' },
        { name: 'shippingAddress', type: 'text' },
        { name: 'packageWeight', type: 'number' },
        { name: 'packageDimensions', type: 'string' },
        { name: 'trackingNumber', type: 'string' },
        { name: 'trackingDetails', type: 'text' },
        { name: 'fulfillmentNotes', type: 'text' }
      ],
      group: 'fulfillment'
    },
    {
      name: 'weight',
      type: 'shipmentWeight', // Custom type
      group: 'fulfillment'
    },
    {
      name: 'dimensions',
      type: 'packageDimensions', // Custom type
      group: 'fulfillment'
    },
    {
      name: 'shippingAddress',
      type: 'object',
      fields: [
        { name: 'name', type: 'string' },
        { name: 'phone', type: 'string' },
        { name: 'email', type: 'string' },
        { name: 'addressLine1', type: 'string' },
        { name: 'addressLine2', type: 'string' },
        { name: 'city', type: 'string' },
        { name: 'state', type: 'string' },
        { name: 'postalCode', type: 'string' },
        { name: 'country', type: 'string' }
      ],
      group: 'fulfillment'
    },
    {
      name: 'billingAddress',
      type: 'object',
      fields: [
        { name: 'name', type: 'string' },
        { name: 'phone', type: 'string' },
        { name: 'email', type: 'string' },
        { name: 'addressLine1', type: 'string' },
        { name: 'addressLine2', type: 'string' },
        { name: 'city', type: 'string' },
        { name: 'state', type: 'string' },
        { name: 'postalCode', type: 'string' },
        { name: 'country', type: 'string' }
      ],
      group: 'fulfillment'
    },
    {
      name: 'carrier',
      type: 'string',
      group: 'fulfillment'
    },
    {
      name: 'service',
      type: 'string',
      group: 'fulfillment'
    },
    {
      name: 'trackingNumber',
      type: 'string',
      group: 'fulfillment'
    },
    {
      name: 'trackingUrl',
      type: 'url',
      group: 'fulfillment'
    },
    {
      name: 'shippedAt',
      type: 'datetime',
      group: 'fulfillment'
    },
    {
      name: 'deliveredAt',
      type: 'datetime',
      group: 'fulfillment'
    },
    {
      name: 'estimatedDeliveryDate',
      type: 'datetime',
      group: 'fulfillment'
    },
    {
      name: 'easypostRateId',
      type: 'string',
      group: 'fulfillment'
    },
    {
      name: 'packingSlipUrl',
      type: 'url',
      group: 'fulfillment'
    },
    {
      name: 'shippingLabelUrl',
      type: 'url',
      group: 'fulfillment'
    },
    {
      name: 'shippingLabelFile',
      type: 'file',
      group: 'fulfillment'
    },
    {
      name: 'shippingLabelRefunded',
      type: 'boolean',
      group: 'fulfillment'
    },
    {
      name: 'shippingLabelRefundedAt',
      type: 'datetime',
      group: 'fulfillment'
    },
    {
      name: 'shippingLabelRefundAmount',
      type: 'number',
      group: 'fulfillment'
    },
    {
      name: 'labelCreatedAt',
      type: 'datetime',
      group: 'fulfillment'
    },
    {
      name: 'labelCost',
      type: 'number',
      group: 'fulfillment'
    },
    {
      name: 'deliveryDays',
      type: 'number',
      group: 'fulfillment'
    },
    {
      name: 'easyPostTrackerId',
      type: 'string',
      group: 'fulfillment'
    },
    {
      name: 'fulfillment',
      type: 'object',
      fields: [
        { name: 'status', type: 'string' },
        { name: 'fulfillmentNotes', type: 'text' },
        { name: 'shippedAt', type: 'datetime' },
        { name: 'deliveredAt', type: 'datetime' }
      ],
      group: 'fulfillment'
    },
    {
      name: 'packageDimensions',
      type: 'object',
      fields: [
        { name: 'weight', type: 'number' },
        { name: 'length', type: 'number' },
        { name: 'width', type: 'number' },
        { name: 'height', type: 'number' },
        { name: 'weightDisplay', type: 'string' },
        { name: 'dimensionsDisplay', type: 'string' }
      ],
      group: 'fulfillment'
    },

    // DOCUMENTS GROUP
    {
      name: 'orderDocuments',
      type: 'array',
      of: [{
        type: 'object',
        fields: [
          { name: 'documentType', type: 'string' },
          { name: 'file', type: 'file' },
          { name: 'url', type: 'url' },
          { name: 'createdAt', type: 'datetime' }
        ]
      }],
      group: 'documents'
    },
    {
      name: 'invoiceData',
      type: 'object',
      fields: [
        { name: 'invoiceNumber', type: 'string' },
        { name: 'invoiceId', type: 'string' },
        { name: 'invoiceUrl', type: 'url' },
        { name: 'pdfUrl', type: 'url' }
      ],
      group: 'documents'
    },

    // TECHNICAL GROUP
    {
      name: 'currency',
      type: 'string',
      group: 'technical'
    },
    {
      name: 'paymentIntentId',
      type: 'string',
      group: 'technical'
    },
    {
      name: 'stripePaymentIntentId',
      type: 'string',
      group: 'technical'
    },
    {
      name: 'stripeSessionId',
      type: 'string',
      group: 'technical'
    },
    {
      name: 'easyPostShipmentId',
      type: 'string',
      group: 'technical'
    },
    {
      name: 'labelPurchased',
      type: 'boolean',
      group: 'technical'
    },
    {
      name: 'labelPurchasedAt',
      type: 'datetime',
      group: 'technical'
    },
    {
      name: 'labelPurchasedBy',
      type: 'string',
      group: 'technical'
    },
    {
      name: 'stripeSummary',
      type: 'object',
      fields: [
        { name: 'data', type: 'text' },
        { name: 'amountDiscount', type: 'number' },
        { name: 'paymentCaptured', type: 'boolean' },
        { name: 'paymentCapturedAt', type: 'datetime' },
        { name: 'cardBrand', type: 'string' },
        { name: 'cardLast4', type: 'string' },
        { name: 'receiptUrl', type: 'url' },
        { name: 'chargeId', type: 'string' },
        { name: 'confirmationEmailSent', type: 'boolean' },
        { name: 'webhookNotified', type: 'boolean' }
      ],
      group: 'technical'
    },
    {
      name: 'paymentCaptureStrategy',
      type: 'string',
      group: 'technical'
    },
    {
      name: 'fulfillmentStatusDisplay',
      type: 'object',
      fields: [
        { name: 'display', type: 'string' }
      ],
      group: 'technical'
    },
    {
      name: 'amountRefunded',
      type: 'number',
      group: 'technical'
    },
    {
      name: 'lastRefundId',
      type: 'string',
      group: 'technical'
    },
    {
      name: 'lastRefundReason',
      type: 'string',
      group: 'technical'
    },
    {
      name: 'lastRefundStatus',
      type: 'string',
      group: 'technical'
    },
    {
      name: 'lastRefundedAt',
      type: 'datetime',
      group: 'technical'
    },
    {
      name: 'slug',
      type: 'slug',
      group: 'technical'
    }

]
}
Order Cart Item Schema:

{
name: 'orderCartItem',
type: 'object',
fields: [
{ name: 'productId', type: 'string' },
{ name: 'productName', type: 'string' },
{ name: 'sku', type: 'string' },
{ name: 'quantity', type: 'number' },
{ name: 'price', type: 'number' }, // Final line price (includes upgrades)
{ name: 'unitPrice', type: 'number' }, // Base unit price
{ name: 'upgradeTotal', type: 'number' }, // Total upgrade cost
{ name: 'options', type: 'string' }, // Variant selection
{ name: 'upgrades', type: 'array', of: [{ type: 'string' }] }, // ["Name", "Price", ...]
{ name: 'imageUrl', type: 'url' }
]
}
CRITICAL FIELD MAPPINGS:

Stripe Field Sanity Field Notes
session.id stripeSessionId Session ID
session.payment_intent stripePaymentIntentId Payment intent ID
session.amount_subtotal amountSubtotal Divide by 100
session.amount_total totalAmount Divide by 100
session.total_details.amount_tax amountTax Divide by 100
session.total_details.amount_shipping amountShipping Divide by 100
session.total_details.amount_discount amountDiscount Divide by 100
session.payment_status paymentStatus "paid", "unpaid", etc.
session.shipping_details.address shippingAddress Object mapping
session.customer_details.address billingAddress Object mapping
Change Control Rules
ALLOWED Changes (No Approval Needed)
✅ Fix bugs in calculations (e.g., order total math)
✅ Add missing fields to match schema
✅ Correct type mismatches (string vs number)
✅ Add validation to prevent bad data
✅ Improve error handling
✅ Add logging/debugging
✅ Update comments/documentation

REQUIRES Approval (Ask First)
⚠️ Add new document types
⚠️ Remove existing fields from order.tsx
⚠️ Change field types (string → number)
⚠️ Modify business logic (pricing, discounts)
⚠️ Change API endpoints or contracts
⚠️ Alter authentication flow
⚠️ Modify webhook handling

FORBIDDEN (Never Do)
❌ Delete production data
❌ Expose secrets in code
❌ Remove error handling
❌ Break existing API contracts
❌ Change Stripe product IDs
❌ Modify completed order data
❌ Bypass authentication
❌ Rename order.tsx to order.ts (it's TSX for a reason)

Task Execution Template
When given a task, follow this structure:

Step 1: Diagnosis
PROBLEM: [What is broken or missing?]
ROOT CAUSE: [Why is it happening?]
AFFECTED FILES: [List specific files]
IMPACT: [What breaks if not fixed?]
Step 2: Solution Plan
CHANGES REQUIRED:

1. fas-sanity/schemas/order.tsx
   - Add field Y
   - Reason: [why needed]

2. fas-cms-fresh/src/pages/api/checkout.ts
   - Update calculation
   - Reason: [why needed]

3. fas-sanity/lib/stripe-order.ts
   - Map new field from Stripe
   - Reason: [why needed]

VALIDATION:

- [ ] Schema types match API usage
- [ ] Totals calculate correctly
- [ ] Existing data still works
- [ ] No new errors introduced
      Step 3: Implementation
      // Only show changed code, not entire files
      // Include before/after comments

// BEFORE:
const total = subtotal + shipping

// AFTER:
const total = subtotal + shipping + tax
Step 4: Verification Checklist

- [ ] Schema changes deployed to Sanity
- [ ] API routes tested locally
- [ ] Frontend displays correct data
- [ ] Stripe totals match Sanity totals
- [ ] No console errors
- [ ] Existing orders still load
      Step 5: Risks & Follow-up
      RISKS:
- [Any potential issues?]
- [Migration needed for old data?]

FOLLOW-UP:

- [Any additional work needed?]
- [Documentation to update?]

If none: "None - change is isolated and safe."
Common Tasks
Add New Field to Order Schema
// 1. Add to schema (fas-sanity/schemas/order.tsx)
{
name: 'newField',
title: 'New Field',
type: 'string',
group: 'overview', // or 'fulfillment', 'documents', 'technical'
validation: Rule => Rule.required()
}

// 2. Update stripe-order.ts to populate it (fas-sanity/lib/stripe-order.ts)
export async function createOrderFromStripeSession(session) {
const order = await sanityClient.create({
\_type: 'order',
newField: 'value', // Add here
// ... other fields
})
}

// 3. Update frontend query (if needed)
const query = `*[_type == "order"]{
  _id,
  newField,
  // ... other fields
}`
Fix Calculation Error
// 1. Identify incorrect calculation in fas-sanity/lib/stripe-order.ts

// BEFORE (wrong):
totalAmount: session.amount_total // Missing division by 100

// AFTER (correct):
totalAmount: (session.amount_total || 0) / 100

// 2. Verify in all locations:
// - fas-sanity/lib/stripe-order.ts (order creation)
// - fas-cms-fresh/src/pages/api/checkout.ts (line item creation)
// - Frontend display components
Add New Integration
// 1. Add config file (fas-cms-fresh/src/lib/newservice.ts)
import NewService from 'new-service-sdk'

export const newService = new NewService({
apiKey: import.meta.env.NEW_SERVICE_API_KEY
})

// 2. Add API route (fas-cms-fresh/src/pages/api/newservice/action.ts)
import { newService } from '@/lib/newservice'

export const POST: APIRoute = async ({ request }) => {
const result = await newService.doSomething()
return new Response(JSON.stringify(result))
}

// 3. Add schema if needed (fas-sanity/schemas/newServiceData.ts)
export default {
name: 'newServiceData',
type: 'document',
fields: [
// ... fields
]
}

// 4. Update environment variables
// .env.local (fas-cms-fresh)
NEW_SERVICE_API_KEY=xxx

// .env (fas-sanity, if needed)
SANITY_STUDIO_NEW_SERVICE_KEY=xxx
Testing Requirements
Before Committing
Run TypeScript type check: npm run type-check
Test API routes locally
Verify Sanity Studio loads without errors
Check browser console for errors
Test with real Stripe test mode data
Verify existing documents still load
Integration Testing
Create test order through full flow
Verify order appears in Sanity with all fields
Check Stripe dashboard matches Sanity data
Test shipping rate calculation
Verify email delivery (if applicable)
Test vendor vs customer flows separately
Regression Testing
Load existing orders (should not break)
Verify old data displays correctly
Check that calculations work for old orders
Ensure no new required fields break old docs
Environment Variables
fas-sanity (.env)

# Sanity

SANITY_STUDIO_PROJECT_ID=your_project_id
SANITY_STUDIO_DATASET=production
SANITY_STUDIO_API_VERSION=2024-01-01

# API Token (for stripe-order.ts)

SANITY_API_TOKEN=skxxx

# Stripe (if needed in Studio)

SANITY_STUDIO_STRIPE_SECRET_KEY=sk_test_xxx

# EasyPost (if needed in Studio)

SANITY_STUDIO_EASYPOST_API_KEY=EZAK_xxx
fas-cms-fresh (.env.local)

# Sanity

PUBLIC_SANITY_PROJECT_ID=your_project_id
PUBLIC_SANITY_DATASET=production
SANITY_API_TOKEN=skxxx # Write token for server-side

# Stripe

STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx

# EasyPost

EASYPOST_API_KEY=EZAK_xxx

# SheerID (Military Verification)

SHEERID_ACCESS_TOKEN=xxx
SHEERID_PROGRAM_ID=xxx

# Email

RESEND_API_KEY=re_xxx

# App

PUBLIC_SITE_URL=http://localhost:4321
PUBLIC_BASE_URL=http://localhost:4321
Error Handling Patterns
API Route Errors (Astro)
export const POST: APIRoute = async ({ request }) => {
try {
// Operation
const result = await doSomething()

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

} catch (error) {
// Log full error server-side
console.error('Operation failed:', error)

    // Return safe error to client
    return new Response(
      JSON.stringify({
        error: 'Operation failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )

}
}
Stripe Errors
import Stripe from 'stripe'

try {
const session = await stripe.checkout.sessions.create({...})
} catch (error) {
if (error instanceof Stripe.errors.StripeError) {
console.error('Stripe error:', error.type, error.message)
return new Response(
JSON.stringify({ error: 'Payment processing failed', details: error.message }),
{ status: 400 }
)
}
throw error
}
Sanity Errors
try {
await sanityClient.create({...})
} catch (error) {
if (error.statusCode === 409) {
// Document already exists
console.error('Duplicate document:', error)
return new Response(
JSON.stringify({ error: 'Document already exists' }),
{ status: 409 }
)
}
throw error
}
Version History
v1.1.0 (2025-12-23)
Updated with actual repo structure
Added real order.tsx schema (TSX, not TS)
Documented checkout.ts and webhooks.ts patterns
Added stripe-order.ts utility patterns
Removed non-existent stripe.ts references
Added complete field mappings for Stripe → Sanity
v1.0.0 (2025-12-23)
Initial master prompt
Defined repo structure
Established integration patterns
Created change control rules
Added task execution template
Usage
When starting a new task:

Read the relevant section of this document
Identify which files need changes
Follow the task execution template
Verify against testing requirements
Update this document if patterns change
This is a living document. Update it when:

New integrations are added
Patterns change
New rules are established
Common tasks are identified
File structure changes
End of Master Prompt v1.1.0

# FAS Motorsports Codex Master Prompt

**Version:** 1.2.0  
**Last Updated:** 2025-12-23  
**Repos:** fas-sanity, fas-cms-fresh

---

## Overview

You have trusted read/write access to the following repositories:

- **fas-sanity** — Sanity Studio, schemas, plugins, webhooks, business logic
- **fas-cms-fresh** — Astro/React frontend, API routes, queries, UI components

This document defines the rules, patterns, and constraints for making changes across both repos while maintaining data integrity, type safety, and business logic consistency.

---

## Core Principles

### 1. Schema-First Development

- All data structures originate in `fas-sanity/schemas/`
- API routes in `fas-cms-fresh` must match Sanity schema types exactly
- Frontend components consume typed data from GROQ queries
- Never invent fields that don't exist in schemas

### 2. Minimal Change Philosophy

- Make the smallest possible change to achieve correctness
- Do NOT refactor, rename, or reformat unrelated code
- Preserve existing behavior unless provably incorrect
- If a change would affect unlisted files, STOP and report it

### 3. Sync Enforcement

- Schema changes require corresponding API/frontend updates
- API changes must validate against current schemas
- Frontend changes must use existing API contracts
- All three layers (schema → API → UI) must stay in sync

### 4. Data Integrity

- Stripe totals must match Sanity order totals
- No undefined or null fields in created documents
- Existing documents must not break due to changes
- All references must resolve to valid documents

---

## Repository Structure

### fas-sanity

```
fas-sanity/
├── schemas/
│   ├── index.ts                    # Schema registry
│   ├── order.tsx                   # Order document type (TSX!)
│   ├── product.ts                  # Product document type
│   ├── customer.ts                 # Customer document type
│   ├── vendor.ts                   # Vendor document type
│   ├── invoice.ts                  # Invoice document type
│   ├── shippingLabel.ts            # EasyPost shipping labels
│   └── [other schemas]
├── components/                     # Custom Studio components
├── lib/
│   └── stripe-order.ts            # Stripe order completion utilities
├── plugins/                        # Studio plugins
└── sanity.config.ts               # Studio configuration
```

### fas-cms-fresh

```
fas-cms-fresh/
├── src/
│   ├── pages/
│   │   └── api/                   # Astro API routes
│   │       ├── checkout.ts        # Stripe checkout creation
│   │       ├── webhooks.ts        # Stripe webhook handler
│   │       ├── shipping/
│   │       │   └── rates.ts       # EasyPost rate fetching
│   │       └── military-verify/
│   │           ├── start.ts       # Military verification
│   │           └── check-status.ts
│   ├── lib/
│   │   ├── sanity.ts              # Sanity client config
│   │   ├── easypost.ts            # EasyPost client config
│   │   ├── auth.ts                # Auth utilities
│   │   └── session.ts             # Session management
│   ├── components/                # React/Astro components
│   └── types/                     # TypeScript types
└── astro.config.mjs
```

**IMPORTANT:**

- No `stripe.ts` file exists - Stripe is imported directly in API routes
- Order schema is `order.tsx` (TSX, not TS) - contains React components
- Webhook handler is `webhooks.ts` (not in subfolder)
- Stripe order utilities live in `fas-sanity/lib/stripe-order.ts`

---

## Integration Points

### 1. Stripe Integration

**Checkout Flow:**

```
Customer → fas-cms-fresh/api/checkout.ts → Stripe Checkout Session → Stripe Webhook → fas-cms-fresh/api/webhooks.ts → Sanity Order Document
```

**Key Files:**

- `fas-cms-fresh/src/pages/api/checkout.ts` — Create checkout sessions (imports Stripe directly)
- `fas-cms-fresh/src/pages/api/webhooks.ts` — Handle Stripe webhook events
- `fas-sanity/lib/stripe-order.ts` — Order creation utilities (optional, may not be used)
- `fas-sanity/schemas/order.tsx` — Order document schema (TSX!)

**Checkout Session Creation Pattern:**

```typescript
// fas-cms-fresh/src/pages/api/checkout.ts
import Stripe from 'stripe'
import {readSession} from '../../server/auth/session'
import type {APIRoute} from 'astro'

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20',
})

export const POST: APIRoute = async ({request}) => {
  try {
    const {cart} = await request.json()

    // Validate cart
    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return new Response(JSON.stringify({error: 'Cart is empty or invalid'}), {
        status: 400,
        headers: {'Content-Type': 'application/json'},
      })
    }

    // Get user session
    const session = await readSession(request)
    const userId = session?.userId || ''
    const userEmail = session?.userEmail || ''

    // Determine order type
    const orderType = 'retail' // TODO: Set to 'wholesale' for vendors

    // Map cart to Stripe line items
    const lineItems = cart.map((item) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.productName || 'Unknown Product',
          images: item.imageUrl ? [item.imageUrl] : [],
          metadata: {
            sanity_product_id: item.productId || '',
            sku: item.sku || '',
            options: item.options || '',
            upgrades: JSON.stringify(item.upgrades || []),
          },
        },
        unit_amount: Math.round((item.price || 0) * 100),
      },
      quantity: item.quantity || 1,
    }))

    // Get base URL
    const origin =
      request.headers.get('origin') ||
      request.headers.get('x-forwarded-host') ||
      import.meta.env.PUBLIC_BASE_URL ||
      'http://localhost:4321'

    // Create checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,

      // CRITICAL: Correct metadata keys
      metadata: {
        customer_id: userId,
        customer_email: userEmail,
        order_type: orderType,
        cart_data: JSON.stringify(
          cart.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            sku: item.sku,
            quantity: item.quantity,
            price: item.price,
            unitPrice: item.unitPrice || item.price,
            options: item.options,
            upgrades: item.upgrades,
            imageUrl: item.imageUrl,
          })),
        ),
      },

      automatic_tax: {enabled: true},
      shipping_address_collection: {
        allowed_countries: ['US', 'CA'],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {amount: 0, currency: 'usd'},
            display_name: 'Free shipping',
            delivery_estimate: {
              minimum: {unit: 'business_day', value: 5},
              maximum: {unit: 'business_day', value: 7},
            },
          },
        },
      ],

      customer_email: userEmail || undefined,
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cart`,
      allow_promotion_codes: true,
    })

    return new Response(JSON.stringify({url: checkoutSession.url}), {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    })
  } catch (error) {
    console.error('Checkout creation error:', error)

    if (error instanceof Stripe.errors.StripeError) {
      return new Response(
        JSON.stringify({
          error: 'Payment processing failed',
          message: error.message,
        }),
        {status: 400, headers: {'Content-Type': 'application/json'}},
      )
    }

    return new Response(JSON.stringify({error: 'Failed to create checkout session'}), {
      status: 500,
      headers: {'Content-Type': 'application/json'},
    })
  }
}
```

**Webhook Handler Pattern:**

```typescript
// fas-cms-fresh/src/pages/api/webhooks.ts
import Stripe from 'stripe'
import {createClient} from '@sanity/client'
import type {APIRoute} from 'astro'

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20',
})

const sanityClient = createClient({
  projectId: import.meta.env.PUBLIC_SANITY_PROJECT_ID!,
  dataset: import.meta.env.PUBLIC_SANITY_DATASET!,
  token: import.meta.env.SANITY_API_TOKEN!,
  apiVersion: '2024-01-01',
  useCdn: false,
})

export const POST: APIRoute = async ({request}) => {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return new Response('No signature', {status: 400})
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, import.meta.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return new Response('Webhook Error', {status: 400})
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ['line_items.data.price.product'],
        })

        await createOrderFromSession(fullSession)
        break
      }

      case 'payment_intent.succeeded': {
        console.log('Payment intent succeeded:', event.data.object.id)
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        await handleRefund(charge)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return new Response(JSON.stringify({received: true}), {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return new Response(JSON.stringify({error: 'Webhook processing failed'}), {
      status: 500,
      headers: {'Content-Type': 'application/json'},
    })
  }
}

async function createOrderFromSession(session: Stripe.Checkout.Session) {
  const lineItems = session.line_items?.data || []

  // Map line items to cart format
  const cart = lineItems.map((item) => {
    const product = item.price?.product as Stripe.Product
    const metadata = product?.metadata || {}

    let upgrades: string[] = []
    try {
      upgrades = metadata.upgrades ? JSON.parse(metadata.upgrades) : []
    } catch (e) {
      console.warn('Failed to parse upgrades:', metadata.upgrades)
    }

    return {
      _type: 'orderCartItem', // CRITICAL: Must be orderCartItem
      _key: generateKey(),
      productId: metadata.sanity_product_id || null,
      productName: item.description || product?.name || 'Unknown Product',
      sku: metadata.sku || null,
      quantity: item.quantity || 1,
      price: (item.amount_total || 0) / 100,
      unitPrice: (item.price?.unit_amount || 0) / 100,
      options: metadata.options || null,
      upgrades: upgrades,
      imageUrl: product?.images?.[0] || null,
    }
  })

  // CRITICAL: Use shipping_details.address, NOT customer_details.address
  const shippingDetails = session.shipping_details
  const shippingAddress = shippingDetails?.address
    ? {
        name: shippingDetails.name || '',
        phone: session.customer_details?.phone || '',
        email: session.customer_details?.email || '',
        addressLine1: shippingDetails.address.line1 || '',
        addressLine2: shippingDetails.address.line2 || '',
        city: shippingDetails.address.city || '',
        state: shippingDetails.address.state || '',
        postalCode: shippingDetails.address.postal_code || '',
        country: shippingDetails.address.country || '',
      }
    : undefined

  const customerDetails = session.customer_details
  const billingAddress = customerDetails?.address
    ? {
        name: customerDetails.name || '',
        phone: customerDetails.phone || '',
        email: customerDetails.email || '',
        addressLine1: customerDetails.address.line1 || '',
        addressLine2: customerDetails.address.line2 || '',
        city: customerDetails.address.city || '',
        state: customerDetails.address.state || '',
        postalCode: customerDetails.address.postal_code || '',
        country: customerDetails.address.country || '',
      }
    : undefined

  // CRITICAL: Use total_details for all amounts
  const amountSubtotal = (session.amount_subtotal || 0) / 100
  const amountTax = (session.total_details?.amount_tax || 0) / 100
  const amountShipping = (session.total_details?.amount_shipping || 0) / 100
  const amountDiscount = (session.total_details?.amount_discount || 0) / 100
  const totalAmount = (session.amount_total || 0) / 100

  const orderNumber = `FAS-${Date.now().toString().slice(-6)}`

  // CRITICAL: Use exact field names from schema
  const order = await sanityClient.create({
    _type: 'order',
    orderNumber: orderNumber,
    createdAt: new Date().toISOString(),
    status: 'paid',
    orderType: session.metadata?.order_type || 'retail',
    paymentStatus: session.payment_status || 'paid',

    // CRITICAL: customerRef (reference), customerName, customerEmail
    customerRef: session.metadata?.customer_id
      ? {
          _type: 'reference',
          _ref: session.metadata.customer_id,
        }
      : undefined,
    customerName: customerDetails?.name || '',
    customerEmail: customerDetails?.email || '',

    cart: cart,

    // CRITICAL: All amount fields required
    amountSubtotal: amountSubtotal,
    amountTax: amountTax,
    amountShipping: amountShipping,
    amountDiscount: amountDiscount,
    totalAmount: totalAmount,

    shippingAddress: shippingAddress,
    billingAddress: billingAddress,

    currency: session.currency || 'usd',
    stripeSessionId: session.id,
    stripePaymentIntentId: (session.payment_intent as string) || null,
    paymentIntentId: (session.payment_intent as string) || null,

    // CRITICAL: stripeSummary must be an object
    stripeSummary: {
      data: JSON.stringify(session),
      amountDiscount: amountDiscount,
      paymentCaptured: session.payment_status === 'paid',
      paymentCapturedAt: session.payment_status === 'paid' ? new Date().toISOString() : undefined,
      webhookNotified: true,
    },
  })

  console.log('✅ Order created:', order._id, orderNumber)
  return order
}

async function handleRefund(charge: Stripe.Charge) {
  const paymentIntentId = charge.payment_intent as string

  if (!paymentIntentId) {
    console.warn('No payment intent ID in refund charge')
    return
  }

  const orders = await sanityClient.fetch(
    `*[_type == "order" && stripePaymentIntentId == $paymentIntentId]`,
    {paymentIntentId},
  )

  if (orders.length === 0) {
    console.warn('No order found for payment intent:', paymentIntentId)
    return
  }

  const order = orders[0]

  await sanityClient
    .patch(order._id)
    .set({
      status: 'refunded',
      paymentStatus: 'refunded',
      amountRefunded: charge.amount_refunded / 100,
      lastRefundedAt: new Date().toISOString(),
    })
    .commit()

  console.log('✅ Order refunded:', order._id)
}

function generateKey(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}
```

**Rules:**

- Line items must include: base price + addOns/upgrades in metadata
- Metadata must include: `customer_id`, `customer_email`, `order_type`
- Webhook must create order with complete cart data
- Totals: `amountSubtotal + amountShipping + amountTax = totalAmount`
- All amounts stored in dollars (not cents) in Sanity
- Stripe amounts divided by 100 before storing

### 2. EasyPost Integration

**Shipping Flow:**

```
Customer enters address → fas-cms-fresh/api/shipping/rates.ts → EasyPost API → Return rates → Customer selects → Stored in checkout session
```

**Key Files:**

- `fas-cms-fresh/src/lib/easypost.ts` — EasyPost client
- `fas-cms-fresh/src/pages/api/shipping/rates.ts` — Fetch shipping rates
- `fas-cms-fresh/src/pages/api/shipping/create-label.ts` — Create shipping labels
- `fas-sanity/schemas/shippingLabel.ts` — Label tracking schema

**Rules:**

- Always validate addresses before rate calculation
- Store EasyPost shipment ID in `easyPostShipmentId` field
- Track label URLs in `shippingLabelUrl` field
- Store tracking numbers in `trackingNumber` field
- Handle rate errors gracefully

### 3. Sanity Integration

**Data Flow:**

```
fas-cms-fresh → GROQ Query → Sanity API → Typed Response → Component Render
fas-cms-fresh → API Mutation → Sanity Client → Document Create/Update → Webhook (optional)
```

**Key Files:**

- `fas-cms-fresh/src/lib/sanity.ts` — Client configuration
- `fas-sanity/schemas/*.ts(x)` — All document schemas
- `fas-cms-fresh/src/pages/api/*` — Server-side mutations

**Rules:**

- Use `apiVersion: '2024-01-01'` consistently
- Server-side: use token for write access
- Client-side: use CDN for read-only queries
- Always project only needed fields in GROQ

### 4. Authentication

**Auth Flow:**

```
User Login → Auth Provider → Session Token → API Routes (validate) → Sanity Queries (filtered by user)
```

**Key Files:**

- `fas-cms-fresh/src/lib/auth.ts` — Auth utilities
- `fas-cms-fresh/src/lib/session.ts` — Session management (readSession)
- `fas-cms-fresh/src/middleware.ts` — Route protection
- `fas-sanity/schemas/customer.ts` — Customer/user data
- `fas-sanity/schemas/vendor.ts` — Vendor accounts

**Rules:**

- Protect all API routes that mutate data
- Filter queries by user permissions
- Store user ID in session, not sensitive data
- Vendors see only their orders/data

---

## Schema Patterns

### Order Schema (order.tsx)

**CRITICAL: This is the actual schema structure from your repo**

```typescript
// fas-sanity/schemas/order.tsx

export default {
  name: 'order',
  type: 'document',
  title: 'Order',
  groups: [
    {name: 'overview', title: 'Overview', default: true},
    {name: 'fulfillment', title: 'Fulfillment'},
    {name: 'documents', title: 'Documents'},
    {name: 'technical', title: 'Technical'},
  ],
  fields: [
    // OVERVIEW GROUP
    {
      name: 'customerRef',
      type: 'reference',
      to: [{type: 'customer'}],
      group: 'overview',
    },
    {
      name: 'orderHeaderDisplay',
      type: 'string',
      group: 'overview',
    },
    {
      name: 'orderNumber',
      type: 'string',
      group: 'overview',
    },
    {
      name: 'createdAt',
      type: 'datetime',
      group: 'overview',
    },
    {
      name: 'status',
      type: 'string',
      options: {
        list: [
          {title: 'Pending', value: 'pending'},
          {title: 'Paid', value: 'paid'},
          {title: 'Fulfilled', value: 'fulfilled'},
          {title: 'Delivered', value: 'delivered'},
          {title: 'Canceled', value: 'canceled'},
          {title: 'Refunded', value: 'refunded'},
        ],
      },
      group: 'overview',
    },
    {
      name: 'orderType',
      type: 'string',
      options: {
        list: [
          {title: 'Online', value: 'online'},
          {title: 'Retail', value: 'retail'},
          {title: 'Wholesale', value: 'wholesale'},
          {title: 'In-Store', value: 'in-store'},
          {title: 'Phone', value: 'phone'},
        ],
      },
      group: 'overview',
    },
    {
      name: 'paymentStatus',
      type: 'string',
      options: {
        list: [
          {title: 'Pending', value: 'pending'},
          {title: 'Paid', value: 'paid'},
          {title: 'Failed', value: 'failed'},
          {title: 'Refunded', value: 'refunded'},
        ],
      },
      group: 'overview',
    },
    {
      name: 'customerName',
      type: 'string',
      group: 'overview',
    },
    {
      name: 'customerEmail',
      type: 'string',
      group: 'overview',
    },
    {
      name: 'cart',
      type: 'array',
      of: [{type: 'orderCartItem'}],
      group: 'overview',
    },
    {
      name: 'totalAmount',
      type: 'number',
      group: 'overview',
    },
    {
      name: 'amountSubtotal',
      type: 'number',
      group: 'overview',
    },
    {
      name: 'amountTax',
      type: 'number',
      group: 'overview',
    },
    {
      name: 'amountShipping',
      type: 'number',
      group: 'overview',
    },
    {
      name: 'amountDiscount',
      type: 'number',
      group: 'overview',
    },
    {
      name: 'invoiceRef',
      type: 'reference',
      to: [{type: 'invoice'}],
      group: 'overview',
    },

    // FULFILLMENT GROUP
    {
      name: 'shippingAddress',
      type: 'object',
      fields: [
        {name: 'name', type: 'string'},
        {name: 'phone', type: 'string'},
        {name: 'email', type: 'string'},
        {name: 'addressLine1', type: 'string'},
        {name: 'addressLine2', type: 'string'},
        {name: 'city', type: 'string'},
        {name: 'state', type: 'string'},
        {name: 'postalCode', type: 'string'},
        {name: 'country', type: 'string'},
      ],
      group: 'fulfillment',
    },
    {
      name: 'billingAddress',
      type: 'object',
      fields: [
        {name: 'name', type: 'string'},
        {name: 'phone', type: 'string'},
        {name: 'email', type: 'string'},
        {name: 'addressLine1', type: 'string'},
        {name: 'addressLine2', type: 'string'},
        {name: 'city', type: 'string'},
        {name: 'state', type: 'string'},
        {name: 'postalCode', type: 'string'},
        {name: 'country', type: 'string'},
      ],
      group: 'fulfillment',
    },
    {
      name: 'trackingNumber',
      type: 'string',
      group: 'fulfillment',
    },
    {
      name: 'trackingUrl',
      type: 'url',
      group: 'fulfillment',
    },
    {
      name: 'shippingLabelUrl',
      type: 'url',
      group: 'fulfillment',
    },
    {
      name: 'easyPostShipmentId',
      type: 'string',
      group: 'technical',
    },

    // TECHNICAL GROUP
    {
      name: 'currency',
      type: 'string',
      group: 'technical',
    },
    {
      name: 'paymentIntentId',
      type: 'string',
      group: 'technical',
    },
    {
      name: 'stripePaymentIntentId',
      type: 'string',
      group: 'technical',
    },
    {
      name: 'stripeSessionId',
      type: 'string',
      group: 'technical',
    },
    {
      name: 'stripeSummary',
      type: 'object',
      fields: [
        {name: 'data', type: 'text'},
        {name: 'amountDiscount', type: 'number'},
        {name: 'paymentCaptured', type: 'boolean'},
        {name: 'paymentCapturedAt', type: 'datetime'},
        {name: 'cardBrand', type: 'string'},
        {name: 'cardLast4', type: 'string'},
        {name: 'receiptUrl', type: 'url'},
        {name: 'chargeId', type: 'string'},
        {name: 'confirmationEmailSent', type: 'boolean'},
        {name: 'webhookNotified', type: 'boolean'},
      ],
      group: 'technical',
    },
    {
      name: 'amountRefunded',
      type: 'number',
      group: 'technical',
    },
    {
      name: 'lastRefundedAt',
      type: 'datetime',
      group: 'technical',
    },
  ],
}
```

**Order Cart Item Schema:**

```typescript
{
  name: 'orderCartItem',
  type: 'object',
  fields: [
    { name: 'productId', type: 'string' },
    { name: 'productName', type: 'string' },
    { name: 'sku', type: 'string' },
    { name: 'quantity', type: 'number' },
    { name: 'price', type: 'number' }, // Final line price (includes upgrades)
    { name: 'unitPrice', type: 'number' }, // Base unit price
    { name: 'options', type: 'string' }, // Variant selection
    { name: 'upgrades', type: 'array', of: [{ type: 'string' }] }, // ["Name", "Price", ...]
    { name: 'imageUrl', type: 'url' }
  ]
}
```

**CRITICAL FIELD MAPPINGS:**

| Stripe Field                            | Sanity Field            | Notes                  |
| --------------------------------------- | ----------------------- | ---------------------- |
| `session.id`                            | `stripeSessionId`       | Session ID             |
| `session.payment_intent`                | `stripePaymentIntentId` | Payment intent ID      |
| `session.amount_subtotal`               | `amountSubtotal`        | Divide by 100          |
| `session.amount_total`                  | `totalAmount`           | Divide by 100          |
| `session.total_details.amount_tax`      | `amountTax`             | Divide by 100          |
| `session.total_details.amount_shipping` | `amountShipping`        | Divide by 100          |
| `session.total_details.amount_discount` | `amountDiscount`        | Divide by 100          |
| `session.payment_status`                | `paymentStatus`         | "paid", "unpaid", etc. |
| `session.shipping_details.address`      | `shippingAddress`       | Object mapping         |
| `session.customer_details.address`      | `billingAddress`        | Object mapping         |

---

## Change Control Rules

### ALLOWED Changes (No Approval Needed)

✅ Fix bugs in calculations (e.g., order total math)  
✅ Add missing fields to match schema  
✅ Correct type mismatches (string vs number)  
✅ Add validation to prevent bad data  
✅ Improve error handling  
✅ Add logging/debugging  
✅ Update comments/documentation

### REQUIRES Approval (Ask First)

⚠️ Add new document types  
⚠️ Remove existing fields from `order.tsx`  
⚠️ Change field types (string → number)  
⚠️ Modify business logic (pricing, discounts)  
⚠️ Change API endpoints or contracts  
⚠️ Alter authentication flow  
⚠️ Modify webhook handling

### FORBIDDEN (Never Do)

❌ Delete production data  
❌ Expose secrets in code  
❌ Remove error handling  
❌ Break existing API contracts  
❌ Change Stripe product IDs  
❌ Modify completed order data  
❌ Bypass authentication  
❌ Rename `order.tsx` to `order.ts` (it's TSX for a reason)

---

## Task Execution Template

When given a task, follow this structure:

### Step 1: Diagnosis

```
PROBLEM: [What is broken or missing?]
ROOT CAUSE: [Why is it happening?]
AFFECTED FILES: [List specific files]
IMPACT: [What breaks if not fixed?]
```

### Step 2: Solution Plan

```
CHANGES REQUIRED:
1. fas-sanity/schemas/order.tsx
   - Add field Y
   - Reason: [why needed]

2. fas-cms-fresh/src/pages/api/checkout.ts
   - Update calculation
   - Reason: [why needed]

VALIDATION:
- [ ] Schema types match API usage
- [ ] Totals calculate correctly
- [ ] Existing data still works
- [ ] No new errors introduced
```

### Step 3: Implementation

```typescript
// Only show changed code, not entire files
// Include before/after comments

// BEFORE:
const total = subtotal + shipping

// AFTER:
const total = subtotal + shipping + tax
```

### Step 4: Verification Checklist

```
- [ ] Schema changes deployed to Sanity
- [ ] API routes tested locally
- [ ] Frontend displays correct data
- [ ] Stripe totals match Sanity totals
- [ ] No console errors
- [ ] Existing orders still load
```

### Step 5: Risks & Follow-up

```
RISKS:
- [Any potential issues?]
- [Migration needed for old data?]

FOLLOW-UP:
- [Any additional work needed?]
- [Documentation to update?]

If none: "None - change is isolated and safe."
```

---

## Common Tasks

### Add New Field to Order Schema

```typescript
// 1. Add to schema (fas-sanity/schemas/order.tsx)
{
  name: 'newField',
  title: 'New Field',
  type: 'string',
  group: 'overview', // or 'fulfillment', 'documents', 'technical'
  validation: Rule => Rule.required()
}

// 2. Update webhook to populate it (fas-cms-fresh/src/pages/api/webhooks.ts)
const order = await sanityClient.create({
  _type: 'order',
  newField: 'value', // Add here
  // ... other fields
})

// 3. Update frontend query (if needed)
const query = `*[_type == "order"]{
  _id,
  newField,
  // ... other fields
}`
```

### Fix Calculation Error

```typescript
// 1. Identify incorrect calculation in fas-cms-fresh/src/pages/api/webhooks.ts

// BEFORE (wrong):
totalAmount: session.amount_total // Missing division by 100

// AFTER (correct):
totalAmount: (session.amount_total || 0) / 100

// 2. Verify in all locations:
// - fas-cms-fresh/src/pages/api/webhooks.ts (order creation)
// - fas-cms-fresh/src/pages/api/checkout.ts (line item creation)
// - Frontend display components
```

---

## Testing Requirements

### Before Committing

- [ ] Run TypeScript type check: `npm run type-check`
- [ ] Test API routes locally
- [ ] Verify Sanity Studio loads without errors
- [ ] Check browser console for errors
- [ ] Test with real Stripe test mode data
- [ ] Verify existing documents still load

### Integration Testing

- [ ] Create test order through full flow
- [ ] Verify order appears in Sanity with all fields
- [ ] Check Stripe dashboard matches Sanity data
- [ ] Test shipping rate calculation
- [ ] Verify email delivery (if applicable)
- [ ] Test vendor vs customer flows separately

### Regression Testing

- [ ] Load existing orders (should not break)
- [ ] Verify old data displays correctly
- [ ] Check that calculations work for old orders
- [ ] Ensure no new required fields break old docs

---

## Environment Variables

### fas-sanity (.env)

```bash
# Sanity
SANITY_STUDIO_PROJECT_ID=your_project_id
SANITY_STUDIO_DATASET=production
SANITY_STUDIO_API_VERSION=2024-01-01

# API Token (for server-side operations)
SANITY_API_TOKEN=skxxx

# Stripe (if needed in Studio)
SANITY_STUDIO_STRIPE_SECRET_KEY=sk_test_xxx

# EasyPost (if needed in Studio)
SANITY_STUDIO_EASYPOST_API_KEY=EZAK_xxx
```

### fas-cms-fresh (.env.local)

```bash
# Sanity
PUBLIC_SANITY_PROJECT_ID=your_project_id
PUBLIC_SANITY_DATASET=production
SANITY_API_TOKEN=skxxx  # Write token for server-side

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx

# EasyPost
EASYPOST_API_KEY=EZAK_xxx

# SheerID (Military Verification)
SHEERID_ACCESS_TOKEN=xxx
SHEERID_PROGRAM_ID=xxx

# Email
RESEND_API_KEY=re_xxx

# App
PUBLIC_SITE_URL=http://localhost:4321
PUBLIC_BASE_URL=http://localhost:4321
```

---

## Error Handling Patterns

### API Route Errors (Astro)

```typescript
export const POST: APIRoute = async ({request}) => {
  try {
    const result = await doSomething()

    return new Response(JSON.stringify({success: true, data: result}), {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    })
  } catch (error) {
    console.error('Operation failed:', error)

    return new Response(
      JSON.stringify({
        error: 'Operation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {status: 500, headers: {'Content-Type': 'application/json'}},
    )
  }
}
```

### Stripe Errors

```typescript
import Stripe from 'stripe'

try {
  const session = await stripe.checkout.sessions.create({...})
} catch (error) {
  if (error instanceof Stripe.errors.StripeError) {
    console.error('Stripe error:', error.type, error.message)
    return new Response(
      JSON.stringify({ error: 'Payment processing failed', details: error.message }),
      { status: 400 }
    )
  }
  throw error
}
```

### Sanity Errors

```typescript
try {
  await sanityClient.create({...})
} catch (error) {
  if (error.statusCode === 409) {
    console.error('Duplicate document:', error)
    return new Response(
      JSON.stringify({ error: 'Document already exists' }),
      { status: 409 }
    )
  }
  throw error
}
```

---

## Version History

### v1.2.0 (2025-12-23)

- ✅ Corrected all references to `order.tsx` (was incorrectly showing as `order.tsx`)
- ✅ Removed references to non-existent `fas-sanity/lib/stripe-order.ts` from main flow
- ✅ Clarified that webhooks.ts creates orders directly (not via utility)
- ✅ Updated orderType values to include 'online', 'retail', 'wholesale', 'in-store', 'phone'
- ✅ Updated status values to match actual schema: 'pending', 'paid', 'fulfilled', 'delivered', 'canceled', 'refunded'
- ✅ Aligned all code examples with actual implementation patterns
- ✅ Fixed API version references (2024-11-20 for Stripe, 2024-01-01 for Sanity)

### v1.1.0 (2025-12-23)

- Updated with actual repo structure
- Added real order.tsx schema (TSX, not TS)
- Documented checkout.ts and webhooks.ts patterns
- Removed non-existent stripe.ts references
- Added complete field mappings for Stripe → Sanity

### v1.0.0 (2025-12-23)

- Initial master prompt
- Defined repo structure
- Established integration patterns
- Created change control rules
- Added task execution template

---

## Usage

When starting a new task:

1. Read the relevant section of this document
2. Identify which files need changes
3. Follow the task execution template
4. Verify against testing requirements
5. Update this document if patterns change

**This is a living document. Update it when:**

- New integrations are added
- Patterns change
- New rules are established
- Common tasks are identified
- File structure changes

---

**End of Master Prompt v1.2.0**
