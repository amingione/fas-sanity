Status: APPROVED
Effective Date: 2025-12-27
Applies To: All environments
Codex Enforcement Mode: Mechanical only. No interpretation.
Last Reviewed: 2025-12-27

Schema Contract Decisions — Cross-Workflow Audit
These are schema contract decisions, not implementation steps.
Executive Summary
Critical Finding:
The Invoice schema has an editable datetime field (shippingDetails.labelPurchasedAt) that should be system-generated and immutable. This creates a publish blocker and data integrity risk. Primary Issues Identified:
🔴 Blocking: Editable datetime in Invoice shipping details
🟡 Confusing: Duplicate date fields in Orders (createdAt vs orderDate)
🟡 Confusing: Missing validation on date ordering (invoice date, quote acceptance)
🟡 Confusing: Editable datetime in Customer shipping quotes array
🟢 Cosmetic: Inconsistent use of date vs datetime for delivery dates

1. Document-Specific Contract Decisions
   1.1 Orders
   Field Current Type Correct Type Editability Validation Risk
   createdAt datetime datetime readOnly Required 🟢 Cosmetic
   orderDate datetime REMOVE N/A N/A 🟡 Confusing
   fulfillment.labelPurchasedAt datetime datetime readOnly None ✅ Correct
   fulfillment.labelPrintedAt datetime datetime readOnly None ✅ Correct
   fulfillment.deliveryDate date date readOnly None ✅ Correct
   Decisions:
   REMOVE orderDate field entirely — Duplicates createdAt and creates confusion
   createdAt is the authoritative timestamp for when order was created
   fulfillment.deliveryDate as date is correct (day-level precision is appropriate)
   All fulfillment timestamps remain datetime and readOnly
   Rationale:
   Having both createdAt and orderDate with identical values serves no purpose and creates maintenance burden. The UI label "Order Date" can be applied to createdAt without needing a separate field.
   1.2 Invoices ⚠️ HIGH PRIORITY
   Field Current Type Correct Type Editability Validation Risk
   invoiceDate date date Editable ≥ order.createdAt 🟡 Confusing
   dueDate date date Editable > invoiceDate 🟡 Confusing
   createdAt datetime datetime readOnly Required ✅ Correct
   shippingDetails.labelPurchasedAt datetime datetime readOnly None 🔴 BLOCKING
   shippingDetails.availableRates.estimatedDeliveryDate date date readOnly None 🟡 Confusing
   Critical Decision — shippingDetails.labelPurchasedAt: Current State:
   Type: datetime ✅
   Editability: User-editable ❌
   Source: Should be EasyPost webhook/API
   Risk: Users can enter invalid timestamps, breaking shipping workflow
   Correct Contract:
   Type: datetime (ISO 8601)
   Editability: readOnly
   Source: System-only (EasyPost API response)
   Validation: None needed (system-set)
   Why This Is Blocking:
   Data Integrity: Label purchase time is a factual event from EasyPost, not user opinion
   Workflow Dependencies: Other systems may rely on this timestamp for tracking/auditing
   Publishing: Sanity may block publish if user enters malformed datetime
   Financial Audit: Label purchase time ties to billing events; must be accurate
   Impact of Fix:
   Prevents users from entering incorrect label purchase times
   Ensures shipping workflow integrity
   Allows safe publishing of invoice documents
   Aligns with EasyPost API contract
   Additional Validation Decisions:
   Add validation: invoiceDate must be ≥ order.createdAt (if order reference exists)
   Add validation: dueDate must be > invoiceDate
   estimatedDeliveryDate should remain date (API provides date-only value)
   1.3 Quotes
   Field Current Type Correct Type Editability Validation Risk
   quoteDate date date Editable ≥ createdAt date 🟡 Confusing
   expirationDate date date Editable > quoteDate ✅ Correct
   acceptedDate date date Editable ≥ quoteDate, ≤ expirationDate 🟡 Confusing
   createdAt datetime datetime readOnly Required ✅ Correct
   lastEmailedAt datetime datetime readOnly None ✅ Correct
   stripeLastSyncedAt datetime datetime readOnly None ✅ Correct
   Decisions:
   Add validation: acceptedDate must be ≥ quoteDate AND ≤ expirationDate
   Add validation: quoteDate must be ≥ createdAt (date portion)
   All datetime fields remain readOnly (correct)
   Rationale:
   A quote cannot be accepted before it was issued or after it expired. This is a logical business rule that should be enforced at the schema level.
   1.4 Customers
   Field Current Type Correct Type Editability Validation Risk
   stripeLastSyncedAt datetime datetime readOnly None ✅ Correct
   emailMarketing.subscribedAt datetime datetime readOnly None ✅ Correct
   emailMarketing.unsubscribedAt datetime datetime readOnly None ✅ Correct
   lastOrderDate datetime datetime readOnly None ✅ Correct
   firstOrderDate datetime datetime readOnly None ✅ Correct
   shippingQuotes[].createdAt datetime datetime readOnly Auto-set on creation 🟡 Confusing
   updatedAt datetime datetime readOnly None ✅ Correct
   Decision — shippingQuotes[].createdAt: Current State:
   Type: datetime ✅
   Editability: User-editable (part of array) ❌
   Risk: Users can modify upload timestamp
   Correct Contract:
   Type: datetime
   Editability: readOnly
   Initial Value: new Date().toISOString() on array item creation
   User Action: Can only add/remove array items, not modify timestamps
   Rationale:
   createdAt represents when a file was uploaded. This is a factual timestamp, not user-editable data. Making it readOnly prevents temporal confusion ("when did they actually upload this?").
   1.5 Shipments
   Field Current Type Correct Type Editability Validation Risk
   trackingDetails[].datetime datetime datetime readOnly None ✅ Correct
   forms[].createdAt datetime datetime readOnly None ✅ Correct
   createdAt datetime datetime readOnly None ✅ Correct
   updatedAt datetime datetime readOnly None ✅ Correct
   Decisions:
   No changes needed. Shipments are purely system-managed via EasyPost webhooks. All contracts are correct.
2. Cross-Document Consistency Rules
   2.1 System Timestamps
   Rule: All system-generated timestamps use datetime (ISO 8601) and are readOnly.
   Field Name Type Editability Source
   createdAt datetime readOnly Initial value on document creation
   updatedAt datetime readOnly Auto-updated by system
   *SyncedAt datetime readOnly External webhook/API
   *EmailedAt datetime readOnly System automation
   Apply to: All document types
   2.2 Business Event Timestamps
   Rule: Timestamps for business events (payment, shipping, delivery) use datetime and are readOnly.
   Field Pattern Type Editability Source
   labelPurchasedAt datetime readOnly EasyPost API
   labelPrintedAt datetime readOnly EasyPost webhook
   paidAt datetime readOnly Stripe webhook
   shippedAt datetime readOnly Carrier API
   Apply to: Orders, Invoices, Shipments Critical: These are factual events from external systems, never user-entered.
   2.3 User-Entered Business Dates
   Rule: User-entered dates for business purposes use date (YYYY-MM-DD) and are editable with validation.
   Field Name Type Editability Validation
   invoiceDate date Editable ≥ order.createdAt (date)
   dueDate date Editable > invoiceDate
   quoteDate date Editable ≥ createdAt (date)
   expirationDate date Editable > quoteDate
   acceptedDate date Editable ≥ quoteDate, ≤ expirationDate
   Apply to: Invoices, Quotes Rationale:
   These fields represent business calendar dates ("invoice due January 15"), not precise moments in time. Using date is semantically correct and prevents timezone confusion.
   2.4 Delivery Dates
   Rule: Estimated/actual delivery dates use date type (day-level precision).
   Field Name Type Editability Source
   deliveryDate date readOnly Carrier API/webhook
   estimatedDeliveryDate date readOnly Carrier API
   Apply to: Orders, Invoices, Shipments Rationale:
   Carriers provide delivery dates, not delivery times. Using date matches the precision of the data source.
3. Risk Classification & Priority
   🔴 BLOCKING — Fix Immediately
   Invoice: shippingDetails.labelPurchasedAt
   Change from editable to readOnly
   Prevents publish blocker and data corruption
   Impact: Users can no longer manually enter label purchase time
   🟡 CONFUSING — Fix Soon (UX/Ops Risk)
   Orders: Remove orderDate field
   Duplicates createdAt
   Impact: Any queries using orderDate must switch to createdAt
   Invoices: Add validation for invoiceDate and dueDate
   invoiceDate ≥ order.createdAt (date portion)
   dueDate > invoiceDate
   Impact: Users cannot enter logically invalid dates
   Quotes: Add validation for acceptedDate
   acceptedDate ≥ quoteDate AND ≤ expirationDate
   Impact: Users cannot accept quote before issue or after expiration
   Customers: Make shippingQuotes[].createdAt readOnly
   Prevents modification of upload timestamp
   Impact: Users can only add/remove quotes, not change timestamps
   🟢 COSMETIC — Nice to Have
   Orders: Clarify UI label for createdAt
   Display as "Order Date" in UI
   Impact: None (label-only change)
4. Approved Schema Contract Changes
   These decisions are final and should be enforced mechanically by Codex.
   No data migrations are required unless explicitly stated below.

Change Set 1: Blocking Fixes

INVOICE SCHEMA:

- Field: shippingDetails.labelPurchasedAt
  - Set: readOnly = true
  - Reason: System-generated from EasyPost API
  - Risk: 🔴 Blocking

Change Set 2: Data Integrity Fixes

ORDER SCHEMA:

- Field: orderDate
  - Action: REMOVE field entirely
  - Reason: Duplicates createdAt
  - Risk: 🟡 Confusing
  - Migration: Update queries to use createdAt instead

INVOICE SCHEMA:

- Field: invoiceDate
  - Add validation: Must be ≥ order.createdAt (date portion) if order reference exists
  - Reason: Invoice cannot predate order
  - Risk: 🟡 Confusing

- Field: dueDate
  - Add validation: Must be > invoiceDate
  - Reason: Due date must be after invoice date
  - Risk: 🟡 Confusing

QUOTE SCHEMA:

- Field: acceptedDate
  - Add validation: Must be ≥ quoteDate AND ≤ expirationDate
  - Reason: Cannot accept before issue or after expiration
  - Risk: 🟡 Confusing

- Field: quoteDate
  - Add validation: Must be ≥ createdAt (date portion)
  - Reason: Quote date cannot predate creation
  - Risk: 🟡 Confusing

CUSTOMER SCHEMA:

- Field: shippingQuotes[].createdAt
  - Set: readOnly = true
  - Add: initialValue = () => new Date().toISOString()
  - Reason: Upload timestamp should not be user-editable
  - Risk: 🟡 Confusing

Change Set 3: Consistency Enforcement

ALL SCHEMAS:

- Pattern: All *SyncedAt, *EmailedAt, *PurchasedAt, *PrintedAt, \*ShippedAt fields
  - Type: datetime
  - Editability: readOnly
  - Source: System-only
  - Reason: Factual event timestamps from external systems
  - Risk: 🟢 Cosmetic (already correct in most places)

5. Operational Impact Assessment
   Invoice Publishing
   Before Fix:
   Users can enter invalid labelPurchasedAt values
   Publish may fail if malformed datetime entered
   Shipping workflow may break if timestamp is incorrect
   After Fix:
   labelPurchasedAt is system-set only
   Publishing cannot be blocked by user input
   Shipping workflow integrity maintained
   Query Updates Required
   After removing orderDate:
   Any GROQ queries using orderDate must change to createdAt
   API routes filtering by orderDate must update
   Frontend components displaying orderDate must update
   Expected Impact: Low (likely few references)
   Data Migration
   For orderDate removal:
   No migration needed (field can be left in existing documents)
   New documents will not have field
   Queries updated to use createdAt
   For shippingQuotes[].createdAt readOnly:
   Existing timestamps remain intact
   Future array items get auto-set timestamps
   No migration required
6. Final Summary
   Schema Contract Decisions (Approved)
   🔴 CRITICAL: Invoice shippingDetails.labelPurchasedAt → readOnly
   🟡 HIGH: Order orderDate → REMOVE
   🟡 HIGH: Invoice invoiceDate → Add validation ≥ order.createdAt
   🟡 HIGH: Invoice dueDate → Add validation > invoiceDate
   🟡 MEDIUM: Quote acceptedDate → Add validation (≥ quote, ≤ expiration)
   🟡 MEDIUM: Quote quoteDate → Add validation ≥ createdAt
   🟡 MEDIUM: Customer shippingQuotes[].createdAt → readOnly
   Enforcement Rules
   System Timestamps (ALL documents):
   Always datetime (ISO 8601)
   Always readOnly
   Never user-editable
   Business Event Timestamps (Orders, Invoices, Shipments):
   Always datetime (ISO 8601)
   Always readOnly
   Always from external API/webhook
   Business Calendar Dates (Invoices, Quotes):
   Always date (YYYY-MM-DD)
   Editable by users
   Required validation for logical consistency
   Delivery Dates (ALL documents):
   Always date (YYYY-MM-DD)
   Always readOnly
   From carrier API
   These are schema contract decisions, not implementation steps.
   Hand this document to Codex for mechanical enforcement.
