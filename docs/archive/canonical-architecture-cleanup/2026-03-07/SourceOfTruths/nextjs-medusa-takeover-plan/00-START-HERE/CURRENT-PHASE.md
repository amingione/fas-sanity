# ARCHIVED DOCUMENT

This file is superseded by the canonical architecture package:

- docs/governance/checkout-architecture-governance.md
- docs/governance/commerce-authority-checklist.md
- docs/architecture/canonical-commerce-architecture.md

Do not use this file as implementation authority.

---

# Current Phase Tracker
## FAS E-Commerce Restructure

**Last Updated**: February 21, 2026
**Updated By**: Codex (Execution)

---

## 📍 Current Status: Phase 1 In Progress

### Phase 0: Lock Architecture ✅ COMPLETE
**Completed**: February 12, 2026

**Deliverables**:
- ✅ System boundaries defined
- ✅ Architecture roles locked:
  - Medusa = commerce authority
  - Next.js = internal ops console
  - Sanity = content + experience only
  - Astro = storefront render layer
- ✅ Governance documented
- ✅ Pre-implementation audit complete

---

## 🎯 Next Phase: Phase 1 - Stabilize Medusa

### Phase 1: Stabilize Medusa 🚧 IN PROGRESS
**Status**: Active execution
**Actual Start**: February 20, 2026
**Expected Duration**: 1-2 weeks
**Owner**: Codex

### Prerequisites Before Starting
**Status**: 🟡 PARTIALLY VERIFIED (runtime/deploy confirmed; full workflow validation pending)

**Action Required**: Complete remaining API workflow verification checklist

**Critical Blockers to Resolve**:
1. ⏳ Complete full API-only workflow pass (product/cart/shipping/payment/order) and capture evidence
2. ⏳ Confirm/store publishable key propagation for clients using `/store/*` routes
3. ⏳ Confirm canonical Sanity project ID and lock env values across services
4. ⏳ Verify Shippo UPS carrier linkage and test-product shipping metadata
5. ⏳ Rotate and propagate a valid publishable key for `/store/*` (current key is rejected as invalid)

### Phase 1 Objectives
**Goal**: Make Medusa boring and stable before touching UI

**Done Means**:
- [x] Medusa deployed to real host (Railway)
- [ ] All workflows tested via curl/Postman without frontend:
  - [ ] Product creation
  - [ ] Variant ↔ price linking
  - [ ] Cart math
  - [ ] Shipping rate retrieval
  - [ ] PaymentIntent flow
  - [ ] Order creation
  - [ ] Label purchase
- [ ] Environment variables locked and documented
- [ ] API contract documented

### Phase 1 Tasks (from Strategic Plan)

#### 1. Deploy Medusa
- [ ] Choose hosting (Railway, Render, AWS, etc.)
- [ ] Set up production database (Postgres)
- [ ] Set up production Redis
- [ ] Configure environment variables
- [ ] Run database migrations
- [ ] Deploy Medusa backend

#### 2. Verify All Workflows (API-only testing)

**Product Management**:
```bash
# Test product creation
curl -X POST http://localhost:9000/admin/products \
  -H "Authorization: Bearer ${ADMIN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Product","handle":"test-product"}'

# Test variant creation with price
# Test product update
```

**Cart Operations**:
```bash
# Create cart
curl -X POST http://localhost:9000/store/carts

# Add line item
# Update quantity
# Remove item
# Test cart math (subtotal, tax, shipping)
```

**Shipping**:
```bash
# Create cart with address
# Fetch shipping options (should call Shippo)
# Verify 4 UPS rates returned
# Add shipping method to cart
# Verify cart total updates
```

**Payment**:
```bash
# Create payment session (Stripe)
# Create PaymentIntent
# Simulate payment completion
# Verify webhook handling
```

**Order Creation**:
```bash
# Complete cart → creates order
# Verify order in Medusa
# Check order sync to Sanity (webhook)
```

**Fulfillment** (manual label purchase for now):
```bash
# Create fulfillment
# Verify Shippo rate ID preserved
# Test manual label purchase from Sanity Studio
```

#### 3. Lock Environment Variables
- [ ] Document all required env vars
- [ ] Create `.env.template` if not exists
- [ ] Verify no hardcoded secrets
- [ ] Set up env var management (Doppler, AWS Secrets Manager, etc.)

#### 4. Document API Contract
- [ ] Document all admin endpoints used
- [ ] Document all store endpoints used
- [ ] Document webhook payloads
- [ ] Document sync workflow (Medusa → Sanity)

---

## 📊 Progress Tracking

### Completed Tasks
- [x] Railway deployment is live and boots successfully
- [x] Medusa runtime healthy (`/health` returns `OK` on production domain)
- [x] Custom domain routing configured for API host
- [x] Confirmed `/store/*` hard-fails without `x-publishable-api-key` (expected)
- [x] Hosted setup validation passes when using `.env-railway` config source
- [x] Phase 1 validation run logged: `00-START-HERE/PHASE1-VALIDATION-2026-02-21.md`

### In Progress
- [ ] API-only workflow verification checklist
- [ ] Environment contract finalization (`.env` vs `.env-railway`)
- [ ] fas-dash/consumer env propagation for Medusa publishable key
- [ ] Publishable key rotation + propagation validation for `/store/products` and `/store/regions`

### Blocked
- [ ] Phase 2 start is blocked until Phase 1 “Done Means” are fully complete
- [ ] Vendor schema/path removal is blocked until Vendor Preservation Gate is complete (webhook timeline + replacement workspace + rollback plan)

---

## 🚧 Known Issues / Decisions Needed

### 1. Sanity Project ID Mismatch ⚠️
**Issue**: fas-dash has conflicting Sanity project IDs
- `.env` file: `r4og35qd`
- `lib/sanity.ts` hardcoded: `ps4wgpv9`

**Action Needed**: Amber to confirm which is production
**Impact**: Blocks Sanity sync verification

### 2. Medusa Deployment Target
**Decision**: Railway selected and active.
**Notes**:
- Production API domain is live
- Health endpoint is reachable
- Continue Phase 1 validation on Railway deployment

**Action Needed**: None (decision complete)

### 2b. Store Publishable Key Mismatch (Active Blocker) ⚠️
**Issue**: Store resource endpoints are reachable but reject requests due to an invalid publishable key while health/admin baselines are reachable.
- `GET /health` = 200
- `GET /admin/products` = 401 (expected unauthenticated)
- `GET /store` = 400 publishable-key-required (expected)
- `GET /store/products?limit=1` = 400 invalid publishable key
- `GET /store/regions` = 400 invalid publishable key

**Action Needed**: Rotate and propagate the correct publishable key before continuing cart/shipping/payment flow tests.
**Evidence**: `00-START-HERE/PHASE1-VALIDATION-2026-02-21.md`
**Execution Note (2026-02-21)**: Local rotation is currently blocked by missing admin API auth and private Railway DB networking from local runner.

### 3. Historical Order Migration
**Decision Needed**: Migrate old orders from Sanity to Medusa?
**Options**:
- Option A: Leave in Sanity (read-only archive)
- Option B: Migrate recent orders (last 90 days)

**Recommendation**: Option A (start fresh)

### 4. Vendor Transition Guardrail
**Rule**: Do not remove current vendor integration in Sanity yet.
**Required before removal**:
- Webhook-first vendor timeline is live (signed/idempotent/replayable)
- Replacement vendor workspace is accepted by ops
- Rollback path is documented and tested
**Reference docs**:
- `docs/SourceOfTruths/fas-sanity-vendor-portal-keep.md`
- `docs/SourceOfTruths/vendor-portal-webhook-contract.md`
- `docs/SourceOfTruths/vendor-cutover-checklist.md`

---

## 📅 Timeline Estimate

| Phase | Duration | Start Date | End Date | Status |
|-------|----------|------------|----------|--------|
| 0: Lock Architecture | - | - | Feb 12, 2026 | ✅ Complete |
| 1: Stabilize Medusa | 1-2 weeks | Feb 20, 2026 | TBD | 🚧 In Progress |
| 2: Sanity Restructure | 2 weeks | TBD | TBD | 🔜 Next |
| 3: Define Sync Contracts | 1 week | TBD | TBD | 🔜 Next |
| 4: Build Next.js Console | 3-4 weeks | TBD | TBD | 🔜 Next |
| 5: Remove Legacy | 1 week | TBD | TBD | 🔜 Next |
| 6: Optimize UX | 1-2 weeks | TBD | TBD | 🔜 Next |
| 7: Hardening | 1 week | TBD | TBD | 🔜 Next |

**Total Estimated**: 10-14 weeks

---

## 📝 Notes for Codex

### When Starting Phase 1:
1. Update this file to mark Phase 1 as "In Progress"
2. Set actual start date
3. Work through tasks in order listed above
4. Update "Completed Tasks" as you finish each item
5. Flag blockers immediately in "Blocked" section
6. Update "Known Issues" as you discover problems

### When Phase 1 is Complete:
1. Verify ALL "Done Means" criteria are met
2. Update this file to mark Phase 1 as "Complete"
3. Set actual end date
4. Update "Next Phase" to Phase 2
5. Create Phase 2 task list
6. Notify Amber of completion and readiness for Phase 2

### Communication
- Update this file daily with progress
- Flag blockers immediately (don't wait)
- Ask questions early and often
- Reference architecture docs when uncertain

---

## 🎯 Success Criteria

**Phase 1 is complete when you can confidently say**:

> "Medusa is deployed, stable, and handles all core commerce workflows (product, cart, checkout, order, shipping) via API without any frontend. Every critical flow has been tested via curl/Postman and works reliably. The API contract is documented, and environment variables are locked down."

**If you can't say this with confidence, Phase 1 is NOT complete.**

---

**Document Maintained By**: Codex (AI Agent)
**Reviewed By**: Amber Mingione
**Coordinator**: Claude (Cowork Mode)
