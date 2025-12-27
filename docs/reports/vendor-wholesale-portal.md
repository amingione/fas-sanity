Vendor + Wholesale Workflows: Architecture Decisions
Decision Context
The audit identified critical identity, messaging, and profile-sync issues in the vendor/wholesale integration. These decisions resolve blocking architectural flaws while maintaining compatibility with existing customer, order, and Stripe workflows.

1. Identity & Email Canonical Source
   DECISION: APPROVE with Schema Contract Enforcement
   Canonical Source of Truth:
   customer.email is the ONLY canonical source of truth for vendor identity
   vendor.portalAccess.email MUST mirror customer.email at all times
   vendor.primaryContact.email is independent and can differ (business contact vs login)
   Rationale:
   customer document is already the Stripe identity holder
   All authentication must resolve to a single email to prevent orphaned accounts
   Dual-source architecture creates data corruption risk (audit line 13-14)
   Aligns with existing vendor→customer→Stripe pattern from previous decisions
   Schema Contract:
   Field Type Source Editability Sync Direction
   customer.email string CANONICAL Editable (with validation) customer → vendor.portalAccess.email
   vendor.portalAccess.email string MIRROR Read-only Synced FROM customer.email
   vendor.primaryContact.email string Independent Editable No sync (business contact)
   Enforcement Rules:
   Portal Login: MUST authenticate against customer.email only
   Vendor Lookup: Portal session MUST find vendor by customerRef → customer.email match
   Email Change: Changing customer.email MUST trigger sync to vendor.portalAccess.email
   Validation: vendor.portalAccess.email should be marked readOnly: true in schema
   Migration: One-time sync required to align existing records
   Cross-Workflow Impact:
   ✅ Compatible with Stripe customer lookup (uses customer.email)
   ✅ Compatible with order assignment (uses customerRef)
   ✅ Compatible with wholesale pricing (queries by customer role/type)
   ⚠️ Requires vendor portal login refactor to query customer first
2. Vendor Profile Updates
   DECISION: APPROVE Dual-Document Update Pattern
   Editable Fields by Document: Vendor Document (vendor) - Business Profile:
   Field Path Editability Validation Persistence
   companyName Editable Required, unique vendor
   primaryContact.name Editable Required vendor
   primaryContact.email Editable Valid email format vendor
   primaryContact.phone Editable Phone format vendor
   businessAddress.\* Editable Required for tax vendor
   taxId Editable Tax ID format vendor
   paymentTerms Editable Enum validation vendor
   notes Editable Text vendor
   Customer Document (customer) - Identity & Auth:
   Field Path Editability Validation Persistence
   email Editable Canonical, email format, triggers sync customer
   firstName Editable Used for name computation customer
   lastName Editable Used for name computation customer
   phone Editable Phone format customer
   roles System-managed Must include 'vendor' customer
   customerType System-managed Must be 'vendor' or 'both' customer
   Read-Only Fields (Never Editable from Portal):
   Field Path Reason
   vendor.portalAccess.email Synced from customer.email
   vendor.portalAccess.lastLogin System-generated
   vendor.customerRef System-managed relationship
   customer.stripeCustomerId Stripe-authoritative
   customer.name Computed from firstName + lastName
   Update Workflow:
   Portal sends profile update request
   Backend identifies which fields belong to vendor vs customer
   Patches customer document first (triggers email sync if changed)
   Patches vendor document second
   Returns unified profile view
   Validation Rules:
   Email changes on customer MUST propagate to vendor.portalAccess.email immediately
   Changing customer.roles to remove 'vendor' MUST be blocked if vendor.customerRef points to it
   vendor.customerRef changes MUST validate target customer has 'vendor' role
3. Vendor Messaging Model
   DECISION: DEPRECATE vendorMessage Schema
   Rationale:
   Schema is orphaned with no backend functions (audit line 39)
   No clear use case differentiation from standard customer support
   Adds unnecessary complexity to maintain separate message system
   Vendors are already customers - use existing customer support channels
   Replacement Pattern:
   Support Tickets: Use existing customer support system (if present)
   Order Communication: Add orderNotes or messages array to order document
   System Notifications: Use email notifications via Netlify functions
   Vendor Invites: Existing send-vendor-invite function is sufficient
   Schema Changes:
   Mark vendorMessage schema as deprecated (add to schema: deprecated: { reason: '...' })
   Do NOT remove schema immediately (may have historical data)
   Remove from Studio structure/desk
   Document migration path if message history exists
   Alternative (if messaging is required): If business requirements demand vendor-specific messaging, implement as:
   Location: Add messages array to vendor document
   Type: Generic message object type (sender, recipient, subject, body, timestamp)
   Direction: Support both inbound (vendor→admin) and outbound (admin→vendor)
   Link to Orders: Optional orderRef field to associate with specific orders
   Decision: Proceed with deprecation unless user explicitly confirms messaging is a required feature.
4. Vendor Onboarding
   DECISION: APPROVE Automated Customer Detection & Linking
   Onboarding Flow: Scenario A: Vendor Signs Up (New Email)
   Portal signup with email vendor@example.com
   strictFindOrCreateCustomer receives email
   Function queries: _[\_type == "vendor" && primaryContact.email == $email][0]
   If vendor found:
   Create customer with roles: ['vendor'] and customerType: 'vendor'
   Set customer.email = vendor@example.com
   Patch vendor.customerRef to point to new customer
   Sync vendor.portalAccess.email = customer.email
   Return customer document
   If no vendor found:
   Create customer with roles: ['customer'] and customerType: 'retail'
   Standard retail flow
   Scenario B: Existing Customer Becomes Vendor
   Admin creates vendor document in Studio
   Admin fills vendor.primaryContact.email
   Document action "Link to Customer" triggers:
   Query: _[\_type == "customer" && email == $vendorContactEmail][0]
   If customer found: Patch customerRef, add 'vendor' to roles, sync emails
   If not found: Create new customer as in Scenario A
   Scenario C: Vendor Already Has Customer Account
   Admin creates vendor document
   Admin manually sets vendor.customerRef to existing customer
   Validation hook checks:
   Target customer exists
   Target customer has email value
   System patches:
   Add 'vendor' to customer.roles if missing
   Set customer.customerType = 'both' if was 'retail'
   Sync vendor.portalAccess.email = customer.email
   Detection Logic Priority:
   First: Check if vendor.primaryContact.email matches existing vendor record
   Second: Check if email matches existing customer.email
   Third: Create new customer with appropriate role
   Role Assignment Rules:
   Condition customer.roles customer.customerType
   New vendor signup, no retail history ['vendor'] 'vendor'
   Existing retail customer becomes vendor ['customer', 'vendor'] 'both'
   Vendor also shops retail ['customer', 'vendor'] 'both'
   Admin-created vendor, no prior account ['vendor'] 'vendor'
   Automation Requirements:
   strictFindOrCreateCustomer MUST check for vendor match before creating customer
   Vendor document save hook MUST validate customerRef target has 'vendor' role
   Customer document save hook MUST prevent removing 'vendor' role if vendor.customerRef points to it
   Email change on customer MUST sync to vendor.portalAccess.email
   Cross-Workflow Validation Matrix
   Workflow Depends On Blocking Risk Mitigation
   Portal Login customer.email canonical Email mismatch breaks auth Enforce email sync
   Stripe Payments customer.stripeCustomerId Orphaned vendor Require customerRef before transactions
   Wholesale Orders customer role validation Wrong pricing tier Validate 'vendor' role on order creation
   Profile Updates Dual-document patch Partial update failure Atomic transaction or rollback
   Vendor Onboarding Email detection logic Duplicate customers Check both vendor and customer before create
   Implementation Checklist (for Codex)
   Schema Changes
   Mark vendor.portalAccess.email as readOnly: true
   Add deprecation notice to vendorMessage schema
   Add validation rules to prevent customerRef orphaning
   Backend Functions
   Refactor strictFindOrCreateCustomer to check vendor match
   Create syncVendorPortalEmail helper for email sync
   Add vendor profile update endpoint
   Create document action "Link Vendor to Customer"
   Data Migration
   One-time sync: vendor.portalAccess.email ← customer.email for all existing vendors
   Validate all vendors have valid customerRef
   Audit for orphaned vendorMessage documents
   Portal Refactoring
   Change login to authenticate against customer.email
   Update profile update UI to handle dual-document pattern
   Remove messaging UI (if deprecated)
   Summary of Decisions
   Area Decision Impact
   Identity customer.email is canonical, vendor.portalAccess.email is read-only mirror HIGH - Prevents data corruption
   Profile Updates Dual-document pattern with field-level contract MEDIUM - Requires careful backend logic
   Messaging Deprecate vendorMessage schema LOW - Feature gap, but removes orphaned code
   Onboarding Automated vendor detection in strictFindOrCreateCustomer HIGH - Eliminates manual linking errors
   All decisions maintain compatibility with existing Stripe integration, order workflows, and the vendor→customer→Stripe pattern established in previous architecture reviews.
