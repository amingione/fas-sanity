# Prerequisites Checklist
## FAS E-Commerce Restructure

**Before starting Phase 1, verify ALL items below.**

---

## ✅ Infrastructure Requirements

### Medusa Backend (fas-medusa)

| Requirement | Status | Action if Missing |
|------------|--------|-------------------|
| fas-medusa cloned locally | ❓ | `git clone <repo-url>` |
| Postgres database running | ❓ | Install Postgres, create database |
| Redis instance running | ❓ | Install Redis, start service |
| `.env` file exists | ❓ | Copy from `.env.template` in repo |
| Hosted runtime config validated with `.env-railway` | ✅ | See `PHASE1-VALIDATION-2026-02-21.md` |
| Medusa running on `localhost:9000` | ❓ | `npm run dev` in fas-medusa |
| Medusa Admin API accessible | ❓ | Test: `curl http://localhost:9000/admin/auth` |

**Critical Environment Variables** (from `.env.template`):
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/medusa-store

# Redis
REDIS_URL=redis://localhost:6379

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Shippo
SHIPPO_API_KEY=shippo_test_...
SHIPPO_ORIGIN_ADDRESS_LINE1=...
SHIPPO_ORIGIN_CITY=...
SHIPPO_ORIGIN_STATE=...
SHIPPO_ORIGIN_ZIP=...

# Sanity (for sync)
SANITY_PROJECT_ID=r4og35qd
SANITY_DATASET=production
SANITY_API_TOKEN=sk...
SANITY_SYNC_SALES_CHANNEL_ID=sc_...
SANITY_SYNC_SHIPPING_PROFILE_ID=sp_...
```

### Sanity CMS (fas-sanity)

| Requirement | Status | Action if Missing |
|------------|--------|-------------------|
| Sanity project ID confirmed | ❓ | Check Sanity dashboard |
| **CRITICAL**: Verify `r4og35qd` vs `ps4wgpv9` | ❓ | See note below ⚠️ |
| Sanity API token generated | ❓ | Generate in Sanity dashboard |
| Sanity CLI installed | ❓ | `npm install -g @sanity/cli` |

**⚠️ SANITY PROJECT ID MISMATCH**:
- fas-dash `.env` says: `r4og35qd`
- fas-dash `lib/sanity.ts` hardcoded fallback: `ps4wgpv9`

**Action Required**: Determine which is the live production project ID.

### fas-dash (Next.js Internal Console)

| Requirement | Status | Action if Missing |
|------------|--------|-------------------|
| fas-dash cloned locally | ❓ | `git clone <repo-url>` |
| Node.js 18+ installed | ❓ | Install Node.js LTS |
| Dependencies installed | ❓ | `npm install` in fas-dash |

**Will need to add** (Phase 4):
```bash
# Medusa connection
MEDUSA_BACKEND_URL=http://localhost:9000
MEDUSA_ADMIN_API_KEY=... (generate in Medusa)

# Shippo connection
SHIPPO_API_KEY=shippo_test_...

# Stripe connection (for refunds)
STRIPE_SECRET_KEY=sk_test_...
```

### fas-cms-fresh (Astro Storefront)

| Requirement | Status | Action if Missing |
|------------|--------|-------------------|
| fas-cms-fresh cloned locally | ❓ | `git clone <repo-url>` |
| Can access on `localhost:4321` | ❓ | `npm run dev` in fas-cms-fresh |
| Already connects to Medusa | ✅ | Verified in audit |

---

## 🗄️ Data Requirements

### Product Data

| Requirement | Status | Notes |
|------------|--------|-------|
| Product count in Medusa | ❓ | Should have seeded products |
| Product count in Sanity | ❓ | Audit says ~145 schemas total |
| Medusa ↔ Sanity product sync tested | ❓ | Has sync workflow in fas-medusa |
| All products have dimensions | ❓ | Needed for Shippo rate calculation |

### Test Data Needed

- [ ] Test customer accounts in Medusa
- [ ] Test products with variants
- [ ] Test cart workflows
- [ ] Stripe test mode credentials
- [ ] Shippo test mode API key

---

## 🔑 API Keys & Credentials

### Medusa

| Credential | Status | How to Get |
|-----------|--------|------------|
| Admin API key | ❓ | Run `create-api-key.ts` script in fas-medusa |
| Publishable API key | ❓ | In Medusa admin dashboard (must be valid for active sales channel) |
| Sales channel ID | ❓ | Query: `GET /admin/sales-channels` |
| Shipping profile ID | ❓ | Query: `GET /admin/shipping-profiles` |

### Stripe

| Credential | Status | Mode |
|-----------|--------|------|
| Secret key | ❓ | Test mode initially |
| Publishable key | ❓ | Test mode |
| Webhook secret | ❓ | Test mode |

### Shippo

| Credential | Status | Mode |
|-----------|--------|------|
| API token | ❓ | Test mode initially |
| UPS carrier account ID | ❓ | Must connect UPS in Shippo dashboard |

### Sanity

| Credential | Status | Notes |
|-----------|--------|-------|
| Project ID | ❓ | **Verify r4og35qd vs ps4wgpv9** |
| Dataset name | ❓ | Usually 'production' |
| API token (read/write) | ❓ | For sync workflows |

---

## 🧪 Validation Tests

### Before Phase 1, run these tests:

#### Medusa Health Check
```bash
# Medusa backend is running
curl http://localhost:9000/health

# Admin routes accessible
curl http://localhost:9000/admin/products
# Should return 401 (need auth) - this is correct

# Store routes accessible
curl http://localhost:9000/store/products \
  -H "x-publishable-api-key: pk_..."
# Should return product list when key is valid for active sales channel
```

#### Sanity Health Check
```bash
# Sanity project accessible
cd fas-sanity
sanity dataset list
# Should show datasets for project

# Sanity API token works
curl https://r4og35qd.api.sanity.io/v2024-01-01/data/query/production?query=*[_type=="product"][0..1] \
  -H "Authorization: Bearer YOUR_TOKEN"
# Should return product data
```

#### Stripe Health Check
```bash
# Stripe test mode key works
curl https://api.stripe.com/v1/products \
  -u "sk_test_YOUR_KEY:"
# Should return products or empty list
```

#### Shippo Health Check
```bash
# Shippo API key works
curl https://api.goshippo.com/parcels/ \
  -H "Authorization: ShippoToken shippo_test_YOUR_KEY"
# Should return empty list or parcels
```

---

## 📋 Phase 1 Readiness Criteria

**You are ready for Phase 1 when:**

- ✅ Medusa backend running locally
- ✅ Postgres + Redis accessible
- ✅ All Medusa env vars configured
- ✅ Sanity project ID confirmed
- ✅ Sanity API token working
- ✅ Test products exist in Medusa
- ✅ Product sync workflow exists (fas-medusa already has this)
- ✅ Stripe test keys configured
- ✅ Shippo test keys configured
- ✅ UPS carrier account connected in Shippo
- ✅ All health checks pass

**If ANY item is ❌, do NOT proceed to Phase 1.**

## 🔒 Vendor Transition Prerequisite (For Later Phases)

This does not block Phase 1 Medusa stabilization, but it blocks vendor decommission work:
- Do not remove existing vendor integration in Sanity until cutover verification is complete.
- Vendor timeline must be webhook-first, signed, idempotent, and replayable before cutover.

References:
- `docs/SourceOfTruths/fas-sanity-vendor-portal-keep.md`
- `docs/SourceOfTruths/vendor-portal-webhook-contract.md`
- `docs/SourceOfTruths/vendor-cutover-checklist.md`

---

## 🚨 Common Issues & Fixes

### Issue: Medusa won't start
**Symptoms**: `npm run dev` fails
**Check**:
1. Postgres running? `pg_isready`
2. Redis running? `redis-cli ping`
3. `.env` file exists?
4. Database migrations run? `npm run migrations`

### Issue: Sanity sync not working
**Symptoms**: Products not appearing in Sanity after creation in Medusa
**Check**:
1. Webhook endpoint configured? Check fas-medusa subscribers
2. Sanity API token has write permissions?
3. Sanity project ID correct?

### Issue: Shippo rates not loading
**Symptoms**: No shipping options in checkout
**Check**:
1. Product dimensions set? (length, width, height, weight)
2. Warehouse address configured? (SHIPPO_ORIGIN_* env vars)
3. UPS carrier account connected in Shippo dashboard?
4. Test mode vs. production mode mismatch?

---

## 📝 Pre-Flight Checklist

**Sign off on each before starting Phase 1:**

### Infrastructure
- [ ] Medusa running on localhost:9000
- [ ] Postgres database created and migrated
- [ ] Redis running
- [ ] All repos cloned locally

### Credentials
- [ ] Medusa Admin API key generated
- [ ] Stripe test keys configured
- [ ] Shippo test keys configured
- [ ] Sanity API token with read/write access
- [ ] Sanity project ID verified (r4og35qd or ps4wgpv9)

### Data
- [ ] Test products exist in Medusa
- [ ] Products have dimensions (for Shippo)
- [ ] Test customer accounts created
- [ ] Sales channel ID known
- [ ] Shipping profile ID known

### Testing
- [ ] All health checks pass
- [ ] Can create product via Medusa Admin
- [ ] Can create cart via Medusa Store API
- [ ] Can fetch Shippo rates via Medusa
- [ ] Can create PaymentIntent via Stripe

### Documentation
- [ ] Read `00-START-HERE/INDEX.md`
- [ ] Read `01-FINAL-PLANS/01-Strategic-Execution-Plan.md`
- [ ] Read `02-ARCHITECTURE/01-Pre-Implementation-Audit.md`

---

**Once ALL items checked, update `CURRENT-PHASE.md` to "Phase 1: Stabilize Medusa"**
