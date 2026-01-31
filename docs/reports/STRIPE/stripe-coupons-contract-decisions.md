# Stripe Coupons Contract Decisions

**Version:** 1.0.0
**Date:** 2025-12-28
**Status:** AUTHORITATIVE
**Authority:** This document is the ONLY authority for Stripe coupon implementation in fas-sanity

---

## Executive Decision

**SCHEMA CHANGE APPROVED**

A new `stripeCoupon` document type SHALL be created in `fas-sanity/schemas/` to represent Stripe coupons as READ-ONLY documents synced from Stripe.

**Source of Truth:** Stripe API is the SOLE authoritative source. Sanity is a READ-ONLY cache.

---

## 1. Schema Decisions

### 1.1. Document Type

**APPROVED:**
- **Document Name:** `stripeCoupon`
- **File Location:** `fas-sanity/schemas/stripeCoupon.ts`
- **Document Type:** `document`
- **Read-Only:** YES (enforced via Studio permissions and UI)

### 1.2. Required Fields

The following fields are **REQUIRED** for all `stripeCoupon` documents:

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| `stripeId` | `string` | **YES** | Stripe coupon ID (e.g., "SUMMER20"). UNIQUE identifier. |
| `name` | `string` | **YES** | Human-readable coupon name |
| `duration` | `string` | **YES** | Enum: `once`, `repeating`, `forever` |
| `valid` | `boolean` | **YES** | Whether coupon is currently valid in Stripe |
| `createdAt` | `datetime` | **YES** | Timestamp of coupon creation in Stripe |
| `updatedAt` | `datetime` | **YES** | Timestamp of last sync from Stripe |

**Validation:**
- `stripeId` MUST be unique across all `stripeCoupon` documents
- `duration` MUST be one of: `once`, `repeating`, `forever`
- `valid` MUST accurately reflect Stripe's current state

### 1.3. Optional Fields

The following fields are **OPTIONAL** (may be null/undefined):

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| `percentOff` | `number` | NO | Percentage discount (0-100). Mutually exclusive with `amountOff`. |
| `amountOff` | `number` | NO | Fixed amount discount (in cents). Mutually exclusive with `percentOff`. |
| `currency` | `string` | NO | Currency code (required if `amountOff` is set) |
| `durationInMonths` | `number` | NO | Number of months (required if `duration` is `repeating`) |
| `redeemBy` | `datetime` | NO | Expiration timestamp (if set in Stripe) |
| `maxRedemptions` | `number` | NO | Maximum number of redemptions |
| `timesRedeemed` | `number` | NO | Current redemption count |
| `metadata` | `object` | NO | Stripe metadata (stored as JSON object) |

**Business Rules:**
- If `percentOff` is set, `amountOff` MUST be null/undefined
- If `amountOff` is set, `percentOff` MUST be null/undefined AND `currency` MUST be set
- If `duration` is `repeating`, `durationInMonths` MUST be set
- `redeemBy` may be null (no expiration) or a future/past datetime

### 1.4. Read-Only Enforcement

**READ-ONLY DOCUMENT**

- Studio users SHALL NOT be able to create `stripeCoupon` documents manually
- Studio users SHALL NOT be able to edit any fields in existing `stripeCoupon` documents
- Studio users SHALL NOT be able to delete `stripeCoupon` documents
- All mutations MUST originate from sync mechanisms (webhook or scheduled sync)

**Implementation:**
- Document-level `readOnly: true` in schema
- UI message: "Coupons are managed in Stripe and synced automatically."
- Studio permissions: No create/update/delete actions available

---

## 2. Lifecycle Handling Decisions

### 2.1. Coupon States

**APPROVED STATES:**

| Stripe State | Sanity Representation | Visibility |
|--------------|----------------------|------------|
| Active, valid=true | `valid: true` | Visible in "Active Coupons" list |
| Expired, valid=false | `valid: false` | Visible in "Expired Coupons" list |
| Deleted in Stripe | Document deleted OR marked invalid | Removed from active lists |

### 2.2. Expiration Handling

**DECISION:** Coupons with `redeemBy` in the past SHALL:
- Have `valid: false` set during sync
- Remain in Sanity for historical reference
- Be filterable via "Show Expired" toggle in Studio

### 2.3. Percent vs Amount Discount

**DECISION:** Schema SHALL support both discount types:
- `percentOff` for percentage-based discounts (e.g., 20% off)
- `amountOff` for fixed-amount discounts (e.g., $5 off)
- Studio UI SHALL display appropriate formatting:
  - Percent: "20% off"
  - Amount: "$5.00 off" (convert cents to dollars)

### 2.4. Deletion Handling

**DECISION:** When a coupon is deleted in Stripe:
- **Option A (APPROVED):** Mark document as `valid: false` and add `deletedAt` timestamp
- **Option B (REJECTED):** Hard-delete the document from Sanity

**Rationale:** Preserving deleted coupons maintains historical data integrity for orders that used the coupon.

---

## 3. Sync Mechanism Decisions

### 3.1. Sync Triggers

**APPROVED SYNC MECHANISMS:**

| Mechanism | Trigger | Priority |
|-----------|---------|----------|
| **Webhook Sync** | Stripe `coupon.created`, `coupon.updated`, `coupon.deleted` events | HIGH |
| **Scheduled Sync** | Daily reconciliation (3 AM UTC) | MEDIUM |
| **Manual Backfill** | One-time script for initial population | ONE-TIME |

### 3.2. Webhook Logic

**SYNC LOGIC APPROVED:**

**Event: `coupon.created`**
- Fetch full coupon object from Stripe API
- Create new `stripeCoupon` document in Sanity
- Use `stripeId` as unique identifier

**Event: `coupon.updated`**
- Fetch updated coupon object from Stripe API
- **UPSERT** existing document (update if exists, create if not)
- Update `updatedAt` timestamp

**Event: `coupon.deleted`**
- Fetch coupon ID from webhook payload
- Set `valid: false` and `deletedAt: [current timestamp]`
- DO NOT hard-delete the document

### 3.3. Update vs Upsert Rules

**DECISION: UPSERT ALWAYS**

- All sync operations SHALL use UPSERT logic
- Query by `stripeId` to find existing document
- If found: UPDATE all fields
- If not found: CREATE new document
- This prevents duplicate documents and handles missing webhooks

**Implementation Pattern:**
```
1. Query Sanity for existing document with matching stripeId
2. If exists: PATCH document with updated fields
3. If not exists: CREATE new document
4. Set updatedAt to current timestamp
```

### 3.4. Scheduled Sync Reconciliation

**SYNC SCHEDULE APPROVED:**

- **Frequency:** Daily at 3:00 AM UTC
- **Scope:** Fetch ALL coupons from Stripe (paginated)
- **Logic:** UPSERT each coupon into Sanity
- **Purpose:** Catch missed webhooks, handle deletions, ensure data consistency

**Reconciliation Steps:**
1. Fetch all coupons from Stripe API (handle pagination)
2. For each Stripe coupon: UPSERT into Sanity
3. Identify Sanity coupons not found in Stripe response → mark as deleted
4. Log sync results (created, updated, deleted counts)

### 3.5. Manual Backfill Script

**BACKFILL SCRIPT APPROVED:**

- **Purpose:** Initial population of existing Stripe coupons
- **Execution:** One-time manual run by developer
- **Logic:** Same as scheduled sync (fetch all, upsert all)
- **Location:** `fas-sanity/scripts/backfill-stripe-coupons.ts`

---

## 4. Studio Presentation Decisions

### 4.1. Desk Structure

**APPROVED STRUCTURE:**

```
Customer Data
├── Customers
├── Customer Coupons (Stripe) ← UPDATE THIS
│   ├── All Coupons (stripeCoupon documents)
│   ├── Active Coupons (valid: true)
│   └── Expired Coupons (valid: false)
└── Customer Rewards
```

**DECISION:** The existing "Customer Coupons (Stripe)" desk item SHALL be updated to query `stripeCoupon` documents instead of `customer.discounts`.

### 4.2. List View Configuration

**APPROVED LIST FIELDS:**

Primary list view SHALL display:
- **Coupon Code** (`stripeId`) - as primary label
- **Name** (`name`) - as subtitle
- **Discount** - formatted as "20% off" or "$5.00 off"
- **Duration** - badge display (once/repeating/forever)
- **Status** - badge (Active/Expired)
- **Redemptions** - `timesRedeemed` / `maxRedemptions` (if set)

**Preview Component:**
- Use custom React component for rich preview
- Show full details: discount, duration, redemptions, metadata
- Display expiration date prominently if set

### 4.3. Labeling Rules

**APPROVED LABELS:**

**Document Title:**
```
{stripeId} - {name}
Example: "SUMMER20 - Summer Sale 20% Off"
```

**Discount Display:**
- If `percentOff`: `"{percentOff}% off"`
- If `amountOff`: `"${amountOff / 100} off"` (convert cents to dollars)

**Status Badge:**
- Active: Green badge, "Active"
- Expired: Gray badge, "Expired"
- Deleted: Red badge, "Deleted"

### 4.4. Filtering and Search

**APPROVED FILTERS:**

- **Status:** Active / Expired / Deleted
- **Duration:** Once / Repeating / Forever
- **Discount Type:** Percent Off / Amount Off

**Search Fields:**
- `stripeId` (primary)
- `name`
- `metadata` (JSON text search)

---

## 5. Implementation Constraints

### 5.1. NO Provider Metadata Rule

**CRITICAL:** Stripe-specific operational metadata SHALL NOT be stored in Sanity schema.

**FORBIDDEN FIELDS:**
- Stripe API response timestamps (use `updatedAt` instead)
- Stripe webhook IDs
- Stripe API version strings
- Raw Stripe API responses (except in opaque `metadata` object)

**ALLOWED:**
- Business-meaningful fields defined in Section 1.2 and 1.3
- Generic `metadata` object for Stripe's coupon metadata

### 5.2. Minimal Change Philosophy

**DECISION:** Implementation SHALL:
- Create new `stripeCoupon` schema ONLY
- Update desk structure to query `stripeCoupon` instead of `customer.discounts`
- Add webhook handlers for `coupon.*` events
- Add scheduled sync function
- Create backfill script

**FORBIDDEN:**
- DO NOT refactor existing customer discount logic
- DO NOT modify `customer.discounts` schema (keep for historical data)
- DO NOT remove existing coupon UI components (reuse them)

### 5.3. Data Integrity Rules

**APPROVED CONSTRAINTS:**

- `stripeId` MUST be unique (enforced via Sanity unique validation)
- Documents MUST be created/updated ONLY by sync mechanisms
- Sync failures MUST be logged but SHALL NOT block other coupons
- Invalid data from Stripe MUST be logged and skipped (not crash the sync)

---

## 6. Migration and Rollout

### 6.1. Migration Steps

**APPROVED ROLLOUT PLAN:**

1. **Schema Creation:** Create `stripeCoupon.ts` schema
2. **Studio Update:** Update desk structure to query new schema
3. **Webhook Implementation:** Add `coupon.*` event handlers to `stripeWebhook.ts`
4. **Scheduled Sync:** Add daily reconciliation function
5. **Backfill Execution:** Run manual backfill script to populate existing coupons
6. **Testing:** Verify sync, UI, and data accuracy
7. **Deployment:** Deploy schema and functions to production

### 6.2. Rollback Plan

**APPROVED ROLLBACK:**

If issues arise:
- Revert desk structure to query `customer.discounts`
- Disable webhook handlers for `coupon.*` events
- Disable scheduled sync
- Schema remains (no data loss) but is not actively used

---

## 7. Testing Requirements

### 7.1. Required Tests

**APPROVED TEST CASES:**

- ✅ Webhook `coupon.created` creates new document
- ✅ Webhook `coupon.updated` updates existing document
- ✅ Webhook `coupon.deleted` marks document as deleted
- ✅ Scheduled sync reconciles all coupons
- ✅ Backfill script populates existing coupons
- ✅ Percent-off coupons display correctly
- ✅ Amount-off coupons convert cents to dollars
- ✅ Expired coupons are marked invalid
- ✅ Duplicate `stripeId` is prevented
- ✅ Studio UI shows read-only warning

### 7.2. Edge Cases

**APPROVED EDGE CASE HANDLING:**

- **Webhook missed:** Scheduled sync will reconcile
- **Coupon deleted in Stripe:** Marked invalid, not hard-deleted
- **Invalid data from Stripe:** Logged, skipped, does not crash sync
- **Duplicate `stripeId`:** UPSERT prevents duplicates
- **Expired coupon:** `valid: false`, shown in "Expired Coupons" list

---

## 8. Final Authority

**THIS DOCUMENT IS THE AUTHORITATIVE CONTRACT.**

Codex, Claude Code, and all AI assistants SHALL:
- Follow this document EXACTLY for implementation
- NOT deviate from approved decisions
- NOT add unapproved fields or features
- NOT implement unapproved sync mechanisms

Any changes to this contract REQUIRE explicit approval and a new version.

---

**Approved By:** Amber Min (ambermin)
**Date:** 2025-12-28
**Version:** 1.0.0
