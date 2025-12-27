Vendor → Stripe Customer Architecture Decisions
Decision Status: APPROVE with modifications to sync workflow only.
Executive Summary
The audit is CORRECT. The proposed addition of stripeCustomerId directly to the vendor document is architecturally incompatible with the existing system and must be REJECTED. Approved Architecture:
Vendors ARE represented as Stripe Customers
Stripe Customer ID lives ONLY on the customer document
Vendor document links to customer via customerRef
Sync workflow follows existing patterns
No schema changes are approved. The existing schemas are correct.

1. Vendor Representation in Stripe
   Decision: Vendors ARE Stripe Customers (via linked customer document)
   Rationale:
   customer document is the canonical billing entity
   stripeCustomerId already exists on customer (line 64-70)
   customer already supports vendor classification via:
   roles array (can include 'vendor')
   customerType enum (includes 'vendor' value)
   vendor document links to customer via customerRef (line 729-735)
   Why NOT separate entities:
   Creates data duplication (two sources of truth for Stripe ID)
   Breaks existing payment/invoicing workflows
   Increases architectural complexity
   Violates single-source-of-truth principle
   Why NOT a distinct Stripe object:
   Stripe has no "Vendor" resource type
   All billing entities are Customers in Stripe
   Would require custom Stripe integration
   Approved Pattern:

Vendor Document → customerRef → Customer Document → stripeCustomerId → Stripe 2. Preventing Duplicate Stripe Customers
Decision: Enforce uniqueness via workflow, not schema constraint
Mechanism:
Before creating Stripe customer for vendor:
Check if customerRef exists and is valid
Check if linked customer has stripeCustomerId
If yes → use existing
If no → create new Stripe customer → update customer document
Email-based deduplication:
Query existing customers by vendor's primary contact email
If match found → link vendor to existing customer
If no match → create new customer document
No Schema Changes Required:
stripeCustomerId remains unique per customer document (enforced by Stripe)
customerRef is optional (allows vendor without Stripe sync)
No composite unique constraints needed 3. Stripe Metadata Contract
Required Metadata Fields (Stripe → Customer)
When creating/updating Stripe Customer for a vendor:
Stripe Metadata Key Value Source Purpose
sanity_customer_id Customer \_id Link Stripe → Sanity
sanity_vendor_id Vendor \_id Reverse lookup
account_type "vendor" Dashboard filtering
vendor_number Vendor vendorNumber Human reference
company_name Vendor companyName Display name
business_type Vendor businessType Classification
Distinguishing Vendor vs Customer in Stripe Dashboard: Use Stripe metadata account_type:
"customer" → Retail/online customer
"vendor" → Vendor/wholesale account
"both" → Hybrid (customer who is also vendor)
Stripe Customer Name Field:
Regular customers: {firstName} {lastName}
Vendors: {companyName} (or {companyName} ({primaryContact.name})) 4. Sync Model
Decision: Manual sync via document action (initial), with webhook bi-directional sync
4.1 Initial Sync (Vendor → Stripe)
Trigger: Sanity Studio document action on vendor document Workflow:
User clicks "Sync to Stripe" action on vendor document
Check if customerRef exists:
If yes:
Navigate to linked customer document
Check if stripeCustomerId exists
If yes → sync metadata updates to Stripe
If no → create Stripe customer → update customer doc
If no:
Search for existing customer by email
If found → link via customerRef → proceed to Stripe
If not found → create customer doc → create Stripe customer
Set Stripe metadata (per table above)
Update customer.stripeLastSyncedAt
Display success message with link to Stripe Dashboard
NOT Automatic:
Allows operators to control when vendor becomes billable
Prevents accidental Stripe customer creation
Gives time to verify vendor information is complete
4.2 Ongoing Sync (Bi-Directional via Webhooks)
Stripe → Sanity:
Existing customer.subscription.\* webhooks handle payment updates
Updates customer document (which vendor links to)
No vendor-specific webhook logic needed
Sanity → Stripe:
Manual re-sync via document action
Updates metadata fields only
Does NOT create duplicate customers 5. Editability Rules
5.1 Stripe-Authoritative Fields (on Customer Document)
Read-Only in Sanity:
Field Type Source Reason
stripeCustomerId string Stripe API response Immutable identifier
stripeLastSyncedAt datetime System on sync Audit trail
stripeMetadata array Stripe webhook Stripe owns metadata
Why Read-Only:
stripeCustomerId is assigned by Stripe, cannot be edited
Editing would break Stripe ↔ Sanity linkage
Would create data divergence
5.2 Editable Fields (Sync to Stripe on Manual Sync)
Editable in Sanity → Synced to Stripe Metadata:
Sanity Field Syncs To (Stripe Metadata) Editability
Vendor companyName company_name Editable
Vendor vendorNumber vendor_number Read-only (auto-generated)
Vendor businessType business_type Editable
Vendor primaryContact.email Stripe Customer email Editable
Vendor primaryContact.name Stripe Customer name Editable
Sync Direction: Sanity → Stripe (one-way for these fields) Rationale:
These are business data fields managed in Sanity
Stripe receives updates to keep metadata current
Operators edit in Sanity, sync pushes to Stripe
5.3 Billing Fields (Stripe-Authoritative)
Created in Stripe → Synced to Customer Document via Webhook:
Field Stripe Source Sanity Storage Editability
Payment methods PaymentMethod Customer savedPaymentMethods Read-only
Invoices Invoice Linked invoice documents Read-only
Subscriptions Subscription Customer subscription fields Read-only
Balance Customer.balance Customer currentBalance Read-only 6. Schema Contract Decisions
6.1 NO Schema Changes Approved
Existing Schema is Correct: Customer Document:
✅ stripeCustomerId (line 64-70) → Correct location
✅ roles array → Supports 'vendor' value (line 88)
✅ customerType → Supports 'vendor' value (line 105)
✅ stripeLastSyncedAt (line 72-77) → Audit trail
✅ Read-only enforcement on Stripe fields
Vendor Document:
✅ customerRef (line 729-735) → Correct linking pattern
✅ NO stripeCustomerId field → Correct (prevents duplication)
✅ Business fields editable → Correct (Sanity-authoritative)
6.2 Rejected Schema Changes
❌ DO NOT add stripeCustomerId to vendor document
Reason: Creates duplicate source of truth
Breaks existing architecture
Violates single-responsibility principle
❌ DO NOT make vendor a billing entity
Reason: Customer document is canonical billing entity
All payment workflows expect customer document
Would require major refactoring 7. Implementation Workflow (High-Level)
7.1 Sync Vendor to Stripe (Document Action)

1. User Action: Click "Sync to Stripe" on vendor document
2. Validation:
   - Check vendor.status === 'active'
   - Check vendor.primaryContact.email exists
   - Check vendor.companyName exists
3. Customer Resolution:
   IF vendor.customerRef exists:
   - Load customer document
     ELSE:
   - Query customer where email === vendor.primaryContact.email
   - IF found:
     - Set vendor.customerRef = customer.\_id
   - ELSE:
     - Create new customer document:
       - email: vendor.primaryContact.email
       - firstName: vendor.primaryContact.name (first part)
       - lastName: vendor.primaryContact.name (last part)
       - roles: ['vendor']
       - customerType: 'vendor'
4. Stripe Customer Resolution:
   IF customer.stripeCustomerId exists:
   - Load Stripe customer
   - Update metadata
     ELSE:
   - Create Stripe customer:
     - email: vendor.primaryContact.email
     - name: vendor.companyName
     - metadata: { ...required fields from table above }
   - Save stripeCustomerId to customer document
5. Update Records:
   - customer.stripeLastSyncedAt = now()
   - Display success with Stripe dashboard link
     7.2 Webhook Handling (Stripe → Sanity)

Existing customer.subscription.\* webhooks:

- Update customer document (no vendor-specific logic)
- Vendor accesses via customerRef

8. Accounting & Financial Safety
   8.1 Single Source of Truth
   Approved:
   customer.stripeCustomerId is THE source of truth
   All billing queries go through customer document
   Vendor accesses via reference, never stores Stripe ID
   8.2 Invoice Linking
   Pattern:
   Invoices reference customer (not vendor)
   Vendor relationship derived via vendor.customerRef === invoice.customerRef
   Query Pattern (Vendor Invoices):

\*[_type == "invoice" && customerRef._ref == $customerDocId]
Where $customerDocId comes from vendor.customerRef.\_ref
8.3 Payment History
Authoritative: Stripe via customer document
Display: Vendor portal queries customer's payment history
Never: Duplicate payment data on vendor document 9. Operator UX Considerations
9.1 Studio Document Actions
On Vendor Document:
Action: "Sync to Stripe"
Creates/updates Stripe customer via linked customer doc
Shows success modal with Stripe link
Displays error if validation fails
On Customer Document (when customerType === 'vendor'):
Badge: "Vendor Account"
Link: "View Linked Vendor" (if vendor.customerRef points here)
9.2 Visibility
Vendor Document:
Show customerRef reference field (group: 'settings')
If customerRef exists and has stripeCustomerId:
Display read-only field: "Stripe Status: ✓ Synced"
Display stripeLastSyncedAt
Link to Stripe Dashboard
Customer Document:
If roles includes 'vendor':
Display: "Account Type: Vendor"
Query for linked vendor document
Show link to vendor document 10. Risk Mitigation
10.1 Duplicate Prevention
Risk: Creating duplicate Stripe customers for same vendor Mitigation:
Email-based lookup before creating customer doc
Manual sync action (not automatic)
Sanity Studio validation on sync action
Operator sees existing customer before proceeding
10.2 Orphaned Vendors
Risk: Vendor exists without customer reference Mitigation:
customerRef is optional
Sync action creates customer doc if needed
No billing operations possible without customer doc
10.3 Data Divergence
Risk: Stripe metadata becomes stale Mitigation:
Manual re-sync action available
stripeLastSyncedAt shows sync age
Webhook updates customer doc automatically 11. Final Architecture Decisions Summary
Decision Approved
Vendors represented as Stripe Customers ✅ Yes (via customer doc)
stripeCustomerId on vendor document ❌ No (remains on customer)
stripeCustomerId on customer document ✅ Yes (existing, no changes)
customerRef links vendor → customer ✅ Yes (existing, no changes)
Metadata contract defined ✅ Yes (see table above)
Manual sync via document action ✅ Yes
Bi-directional webhook sync ✅ Yes (existing customer webhooks)
Stripe fields read-only ✅ Yes
Business fields editable in Sanity ✅ Yes (sync to Stripe on demand)
Schema changes required ❌ No (existing schemas correct) 12. Ready-for-Implementation Instructions
These are architecture decisions, not code implementation.
Approved Components:
Document Action: "Sync Vendor to Stripe"
File: src/actions/syncVendorToStripe.ts
Implements workflow from section 7.1
No schema changes required
Metadata Sync Function
Maps vendor fields → Stripe metadata
Uses table from section 3
One-way sync (Sanity → Stripe)
Customer Lookup Logic
Email-based deduplication
Creates customer doc if needed
Links via customerRef
NOT Approved:
❌ Adding stripeCustomerId to vendor schema
❌ Automatic sync on vendor creation
❌ Bi-directional sync of business fields
❌ Separate vendor billing entity
Conclusion: The existing architecture is correct. Vendors should be represented in Stripe via linked customer documents. No schema changes are necessary or approved. Implementation should focus on sync workflows and document actions only.
