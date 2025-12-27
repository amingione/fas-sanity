Discounts & Coupons Studio UX: Architecture Decisions
Decision Context
Gemini audit confirmed the discountsList.tsx component functions correctly but creates a mental model mismatch. The label "Discounts & Coupons" implies a global discount manager, but the implementation ONLY displays customer-level Stripe-synced discounts from customer.discounts[] embedded objects.

1. Current UX Pattern Assessment
   DECISION: INCORRECT LABELING - Requires Reframing
   What the Implementation Actually Does:
   Queries: \*[_type == "customer" && defined(discounts)].discounts[]
   Displays: Customer-level Stripe coupons only
   Scope: Discounts attached to customer accounts via Stripe webhooks
   Parent document: customer
   Child objects: customerDiscount
   What Operators Expect from "Discounts & Coupons":
   Global view of all discount mechanisms across the system
   Ability to see product sales, quote discounts, invoice discounts
   Centralized discount management hub
   Mismatch Analysis:
   Expectation Reality Gap
   "All discounts in the system" Only customer-level Stripe coupons Product/quote/invoice discounts missing
   "Create new discount" Only creates Stripe customer coupons Cannot manage sales pricing
   "Standalone discount documents" Embedded objects in customer docs Cannot open as top-level documents
   Verdict: The current labeling is misleading and creates operational confusion.
2. Studio Labeling & Operator Guidance
   DECISION: RENAME and ADD Context
   Recommended Label Hierarchy:

Customers & Sales
├── Customers
├── Customer Coupons (Stripe) ← RENAME from "Discounts & Coupons"
├── Orders
├── Quotes
└── Invoices

Products
├── Products
└── Product Sales & Pricing ← Existing, no change
Primary View Renaming:
Current Label New Label Subtitle/Description
"Discounts & Coupons" "Customer Coupons (Stripe)" "Customer account-level coupons synced from Stripe. For product sales, see Products. For quote/invoice discounts, see the respective documents."
Alternative Labels (if "Customer Coupons" is too narrow):
"Customer Discounts (Stripe)"
"Account-Level Coupons"
"Stripe Customer Coupons"
In-View Guidance Text: Add a banner or description to the list view:

📌 About Customer Coupons
This view shows Stripe coupons attached to customer accounts. These are synced
automatically from Stripe and applied at checkout.

Other discount types:
• Product Sales: Manage in Products → [Product Name] → Pricing
• Quote Discounts: Set when creating/editing individual quotes
• Invoice Discounts: Set when creating/editing individual invoices
Icon Update:
Current: Generic discount icon
Recommended: Stripe logo + coupon icon to reinforce data source 3. Additional Read-Only Views
DECISION: APPROVE Three Aggregate Views (Optional)
Rationale: While customer coupons are the ONLY Stripe-synced discount type, operators need visibility into the other three discount models without navigating individual documents. View 1: Product Sales Dashboard (Read-Only) Purpose: Aggregate view of products currently on sale Query Pattern:

_[_type == "product" && defined(salePrice) && salePrice > 0]{
\_id,
name,
"regularPrice": variants[0].price,
salePrice,
"discountPercent": round((1 - salePrice / variants[0].price) _ 100),
discountType,
saleStartDate,
saleEndDate
} | order(saleStartDate desc)
Location: Products section, NOT under "Customer Coupons" List Row Design:

Product Name
└── $299 → $249 (17% off) • Seasonal • Ends 2025-12-31
Click Behavior: Navigate to product document (standard editing) Label: "Active Product Sales"
View 2: Quote Discounts Report (Read-Only) Purpose: Aggregate view of quotes with discounts applied Query Pattern:

\*[_type == "quote" && (
defined(discountAmount) && discountAmount > 0 ||
defined(discountPercent) && discountPercent > 0
)]{
\_id,
quoteNumber,
customer->{name, email},
subtotal,
discountAmount,
discountPercent,
total,
status
} | order(\_createdAt desc)
Location: Quotes section, NOT under "Customer Coupons" List Row Design:

Quote #12345 • Customer Name
└── $1,200 - $120 discount (10%) = $1,080 • Pending
Click Behavior: Navigate to quote document (standard editing) Label: "Quotes with Discounts"
View 3: Invoice Discounts Report (Read-Only) Purpose: Aggregate view of invoices with discounts applied Query Pattern:

\*[_type == "invoice" && (
defined(discountAmount) && discountAmount > 0 ||
defined(discountPercent) && discountPercent > 0
)]{
\_id,
invoiceNumber,
customer->{name, email},
subtotal,
discountAmount,
discountPercent,
total,
status
} | order(invoiceDate desc)
Location: Invoices section, NOT under "Customer Coupons" List Row Design:

Invoice #INV-5678 • Customer Name
└── $3,500 - $350 discount (10%) = $3,150 • Paid
Click Behavior: Navigate to invoice document (standard editing) Label: "Invoices with Discounts"
Implementation Decision:
REQUIRED: Rename "Discounts & Coupons" → "Customer Coupons (Stripe)"
OPTIONAL: Add Product Sales / Quote / Invoice aggregate views
GUIDANCE: Add in-view description explaining scope limitation 4. What SHOULD NOT Be Built
EXPLICIT REJECTION LIST
❌ DO NOT BUILD: Global "All Discounts" View
Why Rejected: The four discount types (customer, product, quote, invoice) have different schemas, data sources, and lifecycles. A unified view would require creating a new abstraction layer, which violates the "no new schemas" constraint.
Alternative: Use renamed views with clear boundaries
❌ DO NOT BUILD: Top-Level discount Document Type
Why Rejected:
Customer discounts MUST remain embedded (Stripe-authoritative)
Product/quote/invoice discounts are intrinsic to their parent documents
Creating a separate discount document would duplicate data and break sync
Current Design is Correct: Four separate discount models by design
❌ DO NOT BUILD: Manual Customer Coupon Creation in Studio
Why Rejected: Customer coupons are Stripe-authoritative. Manual creation in Studio would bypass Stripe and create data inconsistency.
Current Pattern is Correct: Use CustomerDiscountsInput component to call Netlify function → Stripe API → webhook sync
Exception: If Stripe API creation is wrapped in the component, this is acceptable
❌ DO NOT BUILD: Cross-Discount Type Classification
Why Rejected: The audit noted "no classification" for discounts. This is intentional - customer coupons are implicitly "customer" by their location in customer.discounts[].
Adding a discountCategory field would be redundant
Product/quote/invoice discounts already have their own classification via parent document type
❌ DO NOT BUILD: Standalone Discount Document Editing
Why Rejected: customerDiscount objects are embedded, not documents. Studio cannot open them as standalone views.
Current Pattern is Correct: Click behavior navigates to parent customer document, then scrolls to discounts array
❌ DO NOT BUILD: Product/Quote/Invoice Discount Sync to Customer
Why Rejected: These are contextual discounts (applied once) vs. customer coupons (reusable). Syncing them to customer records would pollute customer data.
Current Separation is Correct
❌ DO NOT BUILD: Migration to Consolidate Discount Types
Why Rejected: The four discount models serve different purposes and have different lifecycles. Consolidation would break existing workflows and Stripe sync. 5. UX Contract Decisions
Customer Coupons (Stripe) Contract
View Scope:
ONLY displays customer.discounts[] objects
ONLY Stripe-synced coupons
ONLY customer account-level discounts
Data Source:
Authoritative: Stripe (via webhooks)
Schema: customerDiscount embedded objects in customer document
Query: _[_type == "customer" && defined(discounts)].discounts[]
Read Behavior:
List view shows aggregated discounts across all customers
Click navigates to parent customer document
Discount details visible in customer's "Discounts" tab
Write Behavior:
Create: Via CustomerDiscountsInput → Netlify function → Stripe API
Edit: Not allowed (Stripe-authoritative)
Delete/Revoke: Via Netlify function → Stripe API (if supported)
Display Fields (List View):
Field Display Pattern Source
Coupon Name couponName Stripe coupon.name
Discount Value 20% off or $10 off percentOff or amountOff + currency
Status Active / Scheduled / Expired Computed from startsAt/endsAt
Duration Once / 3 months / Forever duration + durationInMonths
Customer John Doe (john@example.com) Parent customer document
Valid Until 2025-12-31 or No expiration endsAt or null
Classification Visual:
Icon: Stripe logo (not generic discount icon)
Color: Blue (Stripe brand color)
Label: "Stripe Coupon" (not "Discount" or "Sale")
Product Sales Contract (If Aggregate View Built)
View Scope:
Products with salePrice > 0 or discountType defined
Read-only aggregate view
Editing happens on product document
Data Source:
Authoritative: Product document fields
Schema: product.salePrice, product.discountType, etc.
Query: _[_type == "product" && defined(salePrice)]
Display Fields:
Field Display Pattern
Product Name Product Name
Regular Price $299
Sale Price $249
Discount % 17% off
Type Seasonal / Clearance
Duration Ends 2025-12-31
Quote/Invoice Discounts Contract (If Aggregate Views Built)
View Scope:
Quotes/invoices with discountAmount > 0 or discountPercent > 0
Read-only aggregate view
Editing happens on quote/invoice document
Data Source:
Authoritative: Quote/invoice document fields
Schema: quote.discountAmount, invoice.discountPercent, etc. 6. Implementation Instructions for Codex
REQUIRED Changes

1. Rename List View

// In structure/index.ts or discountsList.tsx
S.listItem()
.title('Customer Coupons (Stripe)') // CHANGED from "Discounts & Coupons"
.icon(StripeIcon) // CHANGED from generic discount icon
.child(/_ existing discountsList component _/) 2. Add Description Banner

// In discountsList.tsx, add top banner:
<Box padding={4} style={{backgroundColor: '#f0f7ff', borderBottom: '1px solid #ccc'}}>
<Text size={1}>
<strong>About Customer Coupons:</strong> This view shows Stripe coupons
attached to customer accounts. For product sales, see Products.
For quote/invoice discounts, see the respective documents.
</Text>
</Box> 3. Update List Row Labels

// Change "Discount" → "Stripe Coupon" in visual labels
// Add Stripe icon to each row
// Use blue color scheme (Stripe brand)
OPTIONAL Additions 4. Product Sales Aggregate View
Location: Products section
Label: "Active Product Sales"
Query: Products with salePrice > 0
Read-only, navigate to product on click 5. Quote Discounts Aggregate View
Location: Quotes section
Label: "Quotes with Discounts"
Query: Quotes with discountAmount/Percent > 0
Read-only, navigate to quote on click 6. Invoice Discounts Aggregate View
Location: Invoices section
Label: "Invoices with Discounts"
Query: Invoices with discountAmount/Percent > 0
Read-only, navigate to invoice on click 7. Operator Training Guidance
Mental Model Correction
Old (Incorrect) Mental Model:

"Discounts & Coupons" = All discounts in the system
New (Correct) Mental Model:

"Customer Coupons (Stripe)" = Account-level reusable coupons from Stripe
"Product Sales" = Temporary price reductions on products
"Quote Discounts" = One-time discounts on specific quotes
"Invoice Discounts" = One-time discounts on specific invoices
Decision Tree for Operators:

Need to apply a discount?
│
├─ Is this a reusable coupon code for a customer account?
│ └─ YES → Customer Coupons (Stripe) → Create via Netlify function
│
├─ Is this a sale price for a product?
│ └─ YES → Products → Edit product → Set salePrice
│
├─ Is this a one-time discount on a quote?
│ └─ YES → Quotes → Edit quote → Set discountAmount/Percent
│
└─ Is this a one-time discount on an invoice?
└─ YES → Invoices → Edit invoice → Set discountAmount/Percent
Summary of Decisions
Area Decision Impact
Labeling Rename "Discounts & Coupons" → "Customer Coupons (Stripe)" HIGH - Eliminates mental model mismatch
Guidance Add in-view description explaining scope and directing to other discount types MEDIUM - Improves operator clarity
Icon Change to Stripe logo + coupon icon LOW - Reinforces data source
Aggregate Views Optional: Add Product Sales / Quote / Invoice discount views MEDIUM - Improves discoverability
Rejected Patterns No global "All Discounts" view, no top-level discount document N/A - Prevents scope creep
Validation Checklist
Confirms current technical implementation is correct (Gemini audit accurate)
Identifies UX labeling as the root issue (not code)
Provides specific renaming recommendation
Explains WHY other discount types aren't shown (by design, not bug)
Defines clear boundaries for each discount model
Explicitly rejects building unified abstraction
Maintains Stripe authority for customer coupons
Maintains existing product/quote/invoice discount patterns
Provides operator decision tree for discount type selection
Ready for Codex implementation (no architectural unknowns)
Final Recommendation: Implement REQUIRED changes (renaming + guidance). Evaluate OPTIONAL aggregate views based on operator feedback. Do NOT build anything on the rejection list.
