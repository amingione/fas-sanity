# Vendor Workflow Design
_Last updated: 2026-03-15_

End-to-end vendor lifecycle: invite → onboarding → portal → wholesale ordering → fulfillment.
Maps current state gaps and the improved workflow for each phase.

---

## Current State: What's Broken

| Gap | Location | Impact |
|-----|----------|--------|
| Token expires in 24h, no auto-resend | `send-vendor-invite.ts` | Vendors get stuck, setup never completes |
| Vendor session expires in 1h, no refresh | `session.ts` | Vendors get logged out mid-workflow |
| No password reset for vendors | `fas-cms-fresh` | Locked out permanently if forgotten |
| All vendor mutations return 501 in fas-dash | `fas-dash/api/vendors` | Can't update vendor status, tier, or permissions from dashboard |
| Wholesale cart exists, no PO backend | `fas-cms-fresh/cart.astro` | Vendor orders go nowhere |
| `lastLoginAt` never updated on login | `api/auth/login.ts` | Audit trail broken |
| Invite is manual-only (Studio button) | `vendorInviteAction.tsx` | Invitation requires Sanity Studio access |
| Campaign cron emails assume valid token | `vendorOnboardingCampaign.ts` | Follow-up emails point to expired setup link |

---

## Phase 1 — Vendor Onboarding

### Current Flow
```
[Sanity Studio] Admin clicks "Send Invite" button manually
       ↓
send-vendor-invite.ts generates token (expires 24h)
       ↓
Resend delivers email with setup link
       ↓
Vendor clicks link → setup.astro validates token
       ↓
SetupForm.tsx → POST /api/vendor/auth/setup
       ↓
Sanity patched: passwordHash, setupCompletedAt, enabled=true
```

**Problems:**
- Token expires after 24h with no auto-resend
- Campaign follow-up emails (via `vendorOnboardingCampaign.ts`) don't regenerate the token, so they point to a dead link
- No "resend invite" button on the expired-token error page
- Vendor status stays `pending` until manually changed in Studio

### Improved Flow
```
[fas-dash Vendors page] Admin clicks "Invite Vendor" or creates new vendor
       ↓
POST /api/vendor/invite → calls send-vendor-invite Netlify fn
       ↓
Token generated, expiry set to 7 DAYS (not 24h)
invitedAt written to portalAccess
       ↓
Resend delivers email
       ↓
vendor-onboarding-cron.ts runs daily:
  - If setupCompletedAt is null AND token is expired → regenerate token + resend
  - If setupCompletedAt is null AND token not yet expired → send campaign follow-up
       ↓
Vendor clicks link → setup.astro (unchanged)
       ↓
On expired: show "Request a new invite link" button → POST /api/vendor/auth/resend-invite
       ↓
On setup complete → webhook fires to sync fas-dash vendor status to "active"
```

### Changes Required

**`fas-sanity/netlify/functions/send-vendor-invite.ts`**
- Change token expiry: `24 * 60 * 60 * 1000` → `7 * 24 * 60 * 60 * 1000` (7 days)
- Add `regenerate` flag: when called with existing vendor, overwrite old token instead of aborting

**`fas-sanity/netlify/lib/vendorOnboardingCampaign.ts`**
- Before sending any campaign email: check if `setupTokenExpiry < now`
- If expired and not setup: regenerate token (call `send-vendor-invite` with `regenerate=true`), then send email with new link
- Don't send campaign emails that reference a dead setup link

**`fas-cms-fresh/src/pages/vendor-portal/setup.astro`**
- On expired token redirect: pass `vendorId` (obfuscated) to login page
- Show "Request a new invite link" button → calls `/api/vendor/auth/resend-invite`

**`fas-cms-fresh/src/pages/api/vendor/auth/resend-invite.ts`** _(new file)_
- POST with `{ vendorId }` (or lookup by email)
- Rate limit: max 3 resends per vendor per 24h (track via Sanity `emailLog`)
- Calls `send-vendor-invite` Netlify function with `regenerate=true`
- Returns 200 with "Check your email" message

**`fas-dash/src/app/api/vendors/invite/route.ts`** _(new file)_
- POST: triggers invite for a vendor by ID
- Calls fas-sanity `send-vendor-invite` function directly
- Allows admin to re-invite without opening Sanity Studio

---

## Phase 2 — Vendor Session & Auth

### Current State
- Session JWT expires 1 hour after login
- No refresh token
- No password reset flow
- `lastLoginAt` written only during initial setup, not on subsequent logins

### Improved Flow

**Session duration:** extend vendor session from 1h → 30 days (vendors are authenticated, low-risk)

**`fas-cms-fresh/src/pages/api/auth/login.ts`** _(fix)_
```typescript
// After successful vendor password verification, add:
await sanityClient.patch(vendor._id)
  .set({ 'portalAccess.lastLogin': new Date().toISOString() })
  .commit()
```

**`fas-cms-fresh/src/server/auth/session.ts`** _(fix)_
- Change vendor session TTL: `expiresIn: '1h'` → `expiresIn: '30d'`
- Or add a `/api/vendor/auth/refresh` endpoint that issues a new JWT if current JWT is < 7d from expiry

**Password Reset** _(new flow, mirrors existing customer reset)_
- `fas-cms-fresh/src/pages/vendor-portal/forgot-password.astro` — email entry form
- `fas-cms-fresh/src/pages/api/vendor/auth/forgot-password.ts` — generates reset token, emails via Resend
- `fas-cms-fresh/src/pages/vendor-portal/reset-password.astro` — new password form
- `fas-cms-fresh/src/pages/api/vendor/auth/reset-password.ts` — validates token, writes new passwordHash

Reset token pattern: same as setup token (32-byte hex, 1h expiry, stored as `portalAccess.resetToken`)

---

## Phase 3 — Vendor Portal (Day-to-Day)

### Portal Page Inventory (fas-cms-fresh, all built)
```
/vendor-portal/                 Dashboard
/vendor-portal/products         Wholesale catalog (read-only)
/vendor-portal/orders           Vendor's own orders
/vendor-portal/orders/[id]      Order detail
/vendor-portal/quotes           Quote requests
/vendor-portal/quotes/[id]      Quote detail
/vendor-portal/invoices         Invoice list
/vendor-portal/invoices/[id]    Invoice detail
/vendor-portal/cart             Wholesale cart
/vendor-portal/checkout         Wholesale checkout
/vendor-portal/profile          Vendor profile / settings
/vendor-portal/support          Support messages
/vendor-portal/documents        Company documents
/vendor-portal/analytics        Sales analytics (if permitted)
```

### Missing: Product Submission Workflow
Vendors can VIEW the wholesale catalog (read-only Medusa query) but cannot SUBMIT new products for consideration.

**Proposed flow:**
1. Vendor fills "Submit a Product" form in portal (`/vendor-portal/products/submit`)
2. Form POSTs to `/api/vendor/products/submit` → creates a Sanity `vendorProductSubmission` document (new schema type)
3. Sanity document appears in Studio desk under "Vendor → Product Submissions" queue
4. Admin reviews, approves → triggers product creation in Medusa + Sanity
5. Vendor gets email notification on approval/rejection

### Missing: Wholesale Ordering Backend
`fas-cms-fresh/src/pages/vendor-portal/cart.astro` exists but there's no backend route to convert a wholesale cart to a purchase order.

**Proposed flow:**
1. Vendor adds items to wholesale cart (state managed in Astro session or Nanostores)
2. Vendor submits → POST `/api/vendor/orders/create-po`
3. Creates Sanity `purchaseOrder` document (new schema type under fas-sanity)
4. PO appears in fas-dash under Vendors → [Vendor] → Orders tab
5. Admin confirms PO → creates Medusa order (via admin API)
6. Fulfillment handled in fas-dash as normal order

> **Note**: This is unblocked without the `fas-purchase-orders` Medusa module — POs can live entirely in Sanity and fas-dash can read them directly. The Medusa module is only needed for advanced B2B pricing rules and payment terms automation.

---

## Phase 4 — Internal Ops (fas-dash)

### Vendor Mutations: The Right Pattern

Current state: all PATCH/PUT/DELETE on `/api/vendors` return 501 pointing to "fas-vendors Medusa workflows" that don't exist.

**Correct pattern** (no Medusa module needed):
- fas-dash should write vendor mutations **directly to Sanity** via Sanity API, not through Medusa
- Medusa's `/admin/vendors` route is already a read-only Sanity proxy — it was never meant to be a write endpoint
- fas-dash has `SANITY_API_TOKEN` in env (verify) — if so, it can patch vendor docs directly

**`fas-dash/src/app/api/vendors/[id]/route.ts`** _(fix)_
```typescript
// PATCH: write directly to Sanity instead of returning 501
case 'PATCH': {
  const body = await req.json()
  const result = await sanityClient
    .patch(id)
    .set(body) // e.g. { status: 'active', 'portalAccess.enabled': true }
    .commit()
  return NextResponse.json({ vendor: result })
}
```

Fields fas-dash needs to mutate:
- `status` (active / inactive / suspended)
- `portalAccess.enabled` (enable/disable portal)
- `portalAccess.permissions` (adjust what vendor can do)
- `tier` (standard / preferred / platinum / custom)
- `paymentTerms`
- `notes` (internal notes array)

### VendorDetailDialog (not yet built)

Pattern: mirrors `CustomerDetailDialog`. Tabs:

| Tab | Content |
|-----|---------|
| Profile | Company info, tier, payment terms, status controls |
| Portal | Enable/disable toggle, permissions checklist, resend invite button |
| Products | Vendor's submitted/approved products |
| Orders | POs and Medusa orders linked to this vendor |
| Notes | Internal notes (fas-dash staff only) |

### fas-dash Vendor Page Routing
```
/vendors                        Vendor list table (exists, needs VendorDetailDialog)
/vendors/[id]                   Detail page (or open dialog from table row click)
```

---

## Phase 5 — Wholesale Pricing (Future / Waiting On fas-vendors Module)

Currently: tier definitions (`platinum`, `gold`, `silver`, `custom`) exist in Sanity vendor schema but are not linked to Medusa pricing.

**Target state** (requires `fas-vendors` Medusa custom module):
1. When vendor is approved + tier assigned → Medusa customer group created for that tier
2. Medusa price list scoped to customer group (wholesale pricing)
3. Vendor portal product catalog shows tier-specific pricing
4. PO checkout applies wholesale prices automatically

This phase is blocked until `fas-vendors` module is built. Everything above (phases 1–4) is buildable now without it.

---

## Implementation Order (Unblocked Work)

Priority order based on what unblocks the most downstream work:

```
1. Fix token expiry: 24h → 7 days                    (1 line change, immediate)
2. Fix lastLoginAt update on login                    (5 line change, immediate)
3. Extend vendor session: 1h → 30d                   (1 line change, immediate)
4. Fix campaign cron to regenerate expired tokens     (vendorOnboardingCampaign.ts)
5. Add "resend invite" button on expired-token page   (fas-cms-fresh setup.astro)
6. Add /api/vendor/auth/resend-invite route           (new file)
7. Fix fas-dash vendor PATCH to write to Sanity       (route.ts swap)
8. Build VendorDetailDialog in fas-dash               (new component)
9. Add /api/vendor/auth/forgot-password flow          (new files)
10. Build vendor product submission schema + form      (new schema + page)
11. Build wholesale PO creation backend               (new API route + Sanity schema)
```

Items 1–3 are single-line fixes that can be deployed today.
Items 4–8 are 1–3 day efforts each.
Items 9–11 are 1-week efforts each.
