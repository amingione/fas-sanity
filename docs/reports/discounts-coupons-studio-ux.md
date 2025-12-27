Discounts & Coupons Studio UX Pattern
These are UX architecture decisions for Sanity Studio, not schema changes.

1. Confirm: No Document Type List
   Decision: A native documentTypeList is NOT appropriate. Reason:
   customerDiscount objects are NOT top-level documents
   They exist ONLY as embedded objects in customer.discounts[]
   Sanity's native document list requires documents with \_id and \_type at root level
   Attempting to use documentTypeList would fail or require creating fake documents
   Correct Pattern: Custom Structure Builder view with GROQ-powered list.
2. Recommended Studio Pattern: Aggregated Read-Only List
   2.1 High-Level Approach
   Use Sanity Structure Builder to create a custom view:

Studio Desk
├── Orders
├── Customers
├── Products
├── Discounts & Coupons ← Custom view (GROQ-powered)
│ ├── All Discounts
│ ├── Active Discounts
│ ├── Expired Discounts
│ └── Scheduled Discounts
└── ...
Implementation:
Custom Structure Builder list component
Backed by GROQ query across all customer.discounts[]
Aggregates discounts from all customers into single view
Read-only presentation (no inline editing)
2.2 GROQ Query Pattern
Base Query:

\*[_type == "customer" && defined(discounts)] {
\_id,
name,
email,
"discounts": discounts[] {
...,
"\_customerId": ^.\_id,
"\_customerName": ^.name,
"\_customerEmail": ^.email
}
}
| order(discounts[].createdAt desc)
Flattened for List View:

\*[_type == "customer" && defined(discounts)].discounts[] {
...,
"\_customerId": ^.\_id,
"\_customerName": ^.name,
"\_customerEmail": ^.email
} | order(createdAt desc)
Filtered Views:
Active: [status == "active"]
Expired: [status == "expired"]
Scheduled: [status == "scheduled"] 3. List Row Design
3.1 What Appears in Each Row
Column Data Source Format Notes
Code promotionCodeId or stripeCouponId Bold, primary text Main identifier
Value percentOff or amountOff "25% off" or "$10 off" Human-readable
Status status Badge (colored) active/scheduled/expired
Duration duration Text "Once", "Forever", "3 months"
Customer \_customerName (derived) Link Clickable navigation
Valid valid Icon (✓/✗) Quick validity check
Created createdAt Relative time "3 days ago"
Example Row:

[CODE25] 25% off 🟢 Active Forever John Doe ✓ Created 3 days ago
3.2 Click Behavior
When a row is clicked:
Navigate to parent customer document
Use _customerId to find customer
Open customer in Studio
Auto-scroll to discount
Focus on the discounts[] array field
Highlight the specific discount object (if possible)
Show read-only details
All fields visible but not editable
Stripe link to view in Stripe Dashboard (if desired)
Visual Feedback:
Row hover effect (clickable affordance)
Customer name appears as link/button
Icon indicating "external navigation" (→) 4. Visual Classification System
4.1 Discount Type Classification
Since customerDiscount has no explicit type field, derive classification from:
Context (where it lives):
All discounts in customer.discounts[] = "Customer Discount"
Metadata patterns (if present):
metadata contains type: "vendor" → Vendor Discount
metadata contains type: "promo" → Promotional Code
metadata contains type: "customer" → Customer-Specific
Naming conventions:
couponName starts with "VENDOR_" → Vendor
couponName starts with "PROMO\_" → Promo
Otherwise → Customer
4.2 Badge Rules
Status Badges:
Status Color Icon Meaning
active Green 🟢 Currently valid and usable
scheduled Blue 🔵 Starts in future
expired Gray ⚫ Past expiration or max redemptions
Type Badges (if classification implemented):
Type Color Label
Customer Purple "Customer"
Vendor Orange "Vendor"
Promo Blue "Promo"
Combined Display:

🟢 Active • Customer 5. Allowed Actions
5.1 What CANNOT Be Edited
All fields are read-only:
❌ Cannot edit percentOff, amountOff, duration, etc.
❌ Cannot modify status, valid, timesRedeemed
❌ Cannot change startsAt, endsAt, redeemBy
❌ Cannot update metadata
Reason: Stripe is authoritative. Editing in Sanity would create data divergence.
5.2 Allowed Actions
Action 1: View (Read-Only)
Where: Click discount row → Navigate to parent customer
What: View all discount fields in read-only mode
Who: Any operator with customer read access
Action 2: Create (via Netlify Function)
Where: "Create Discount" button in Discounts list view
What: Opens modal with form (customer selection + discount params)
How: Calls createCustomerDiscount Netlify function
Result: New discount created in Stripe → webhook → Sanity sync
Who: Operators with create permission
Action 3: Revoke/Disable (Stripe API)
Where: Discount detail view (inside customer document)
What: Button to disable discount in Stripe
How: Calls Stripe API to delete/invalidate discount
Result: Webhook updates Sanity to mark valid: false
Who: Operators with delete permission
Note: Revoke is destructive and should require confirmation.
5.3 Create Discount Flow
UX Pattern:
User clicks "Create Discount" button in Discounts list
Modal opens with form fields:
Customer (reference picker or email input)
Discount Type (% off or $ off)
Value (number input)
Duration (dropdown: once/repeating/forever)
Expiration (optional date picker)
Promotion Code (optional text input for code)
Form validation (client-side)
Submit → Call Netlify function createCustomerDiscount
Function creates discount in Stripe
Stripe webhook fires → Sanity syncs new discount
Modal closes, list refreshes to show new discount
Important:
Form does NOT write to Sanity directly
All data goes through Stripe first
Sanity receives update via webhook (source of truth) 6. Ensure No "Standalone Document" UX Implication
6.1 Visual Language
Do:
✅ Use term "View in Customer" (not "Open Document")
✅ Show breadcrumb: Customers > John Doe > Discounts > CODE25
✅ Display "Managed by Stripe" badge/label
✅ Show parent customer prominently in row
✅ Use "Navigate to Customer" language
Don't:
❌ Use "Edit" button (implies standalone editing)
❌ Show "Delete" action (use "Revoke" in Stripe context)
❌ Display as if it has independent \_id (it doesn't)
❌ Allow "Create New Document" language
6.2 Navigation Pattern
Clear Parent-Child Relationship:

Discounts List View
├── [CODE25] 25% off 🟢 Active John Doe →
│ └── Click → Customer: John Doe
│ └── Discounts Array
│ └── [CODE25 highlighted]
Not:

❌ Discounts List View
├── [CODE25] (opens as standalone) 7. Structure Builder Implementation (High-Level)
7.1 Custom List Component
File: src/structure/discountsList.tsx Responsibilities:
Fetch all discounts via GROQ
Flatten customer.discounts[] into single array
Render table/list with columns
Handle row click → navigate to customer
Provide "Create Discount" CTA
Support filtering (active/expired/scheduled)
Component Pattern:

export const DiscountsList = () => {
const discounts = useQuery(GROQ_QUERY)

return (
<Card>
<Button onClick={openCreateModal}>Create Discount</Button>
<Table>
{discounts.map(discount => (
<DiscountRow
key={discount.stripeDiscountId}
discount={discount}
onClick={() => navigateToCustomer(discount.\_customerId)}
/>
))}
</Table>
</Card>
)
}
7.2 Structure Definition
File: src/structure/index.ts

export const structure = (S) =>
S.list()
.title('Content')
.items([
S.listItem()
.title('Discounts & Coupons')
.icon(TagIcon)
.child(
S.list()
.title('Discounts')
.items([
S.listItem()
.title('All Discounts')
.child(S.component(DiscountsList).title('All Discounts')),
S.listItem()
.title('Active Discounts')
.child(S.component(DiscountsListActive).title('Active')),
S.listItem()
.title('Expired Discounts')
.child(S.component(DiscountsListExpired).title('Expired')),
])
),
// ... other items
]) 8. Action Semantics Summary
Action Location Behavior API Call Result
View Row click Navigate to parent customer, focus discount None Show read-only fields
Create List CTA button Open modal form Netlify function → Stripe API New discount in Stripe → webhook → Sanity
Revoke Customer detail view Confirmation dialog → Stripe delete Stripe API (delete discount) Webhook → valid: false in Sanity 9. Ready-for-Codex Instructions
These are UX implementation instructions, not schema changes.
Task 1: Create Custom Discount List Component
Build src/structure/discountsList.tsx
Use GROQ to flatten customer.discounts[] across all customers
Display table with columns: Code, Value, Status, Duration, Customer, Valid, Created
Row click navigates to parent customer document
Add "Create Discount" button (opens modal)
Task 2: Implement Create Discount Modal
Form fields: Customer, Type, Value, Duration, Expiration, Code
Client-side validation
Submit calls Netlify function createCustomerDiscount
Show loading state + success/error feedback
Refresh list on success
Task 3: Add Structure Builder Entry
Add "Discounts & Coupons" to main Studio navigation
Sub-items: All, Active, Expired, Scheduled
Each uses custom component with filtered GROQ query
Task 4: Implement Visual Classification
Badge system for status (active/scheduled/expired)
Derive type from metadata or naming convention
Optional type badges (Customer/Vendor/Promo)
Task 5: Add Revoke Action (Optional)
In customer discount detail view
Button: "Revoke in Stripe"
Confirmation dialog (destructive action)
Calls Stripe API to delete discount
Displays success/error state 10. Constraints Confirmation
✅ No new schema - Uses existing customerDiscount object type
✅ No field editing - All fields remain read-only
✅ Stripe authority maintained - Create goes through Netlify → Stripe
✅ No standalone documents - Navigation always shows parent customer
✅ Operator flow preserved - Create/View/Revoke actions respect data flow
End of UX Architecture Decisions
Ready for Codex implementation
