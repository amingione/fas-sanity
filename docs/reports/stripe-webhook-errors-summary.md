# Stripe Webhook Errors Summary

**Date:** 2026-01-03
**Audit Scope:** Production webhook failures and local development issues
**Status:** 2 distinct issues identified

---

## Overview

Two separate Stripe webhook errors have been identified:

1. **CRITICAL (Production):** Customer identity conflict preventing abandoned checkout creation
2. **LOW (Local Dev):** Webhook signature verification failure blocking local testing

These are **completely unrelated issues** requiring different fixes.

---

## Issue #1: Customer Identity Conflict (CRITICAL)

### Error Details

**File:** `docs/reports/stripe-error-logs/error1.txt`
**Environment:** Production (Netlify)
**Severity:** CRITICAL
**Impact:** Abandoned checkout documents not created, cart recovery lost

```
ERROR  stripeWebhook: conflicting customer stripe ids
       ATZnC953ZI6BkOhriZTtDE cus_TgonYtaRUjUXOZ cus_Th0NSA5EcegRfp
WARN   stripeWebhook: failed to upsert checkoutSession document
       Error: Customer identity conflict
```

### Root Cause

**Production code is outdated** and does not match the current repository code.

- **Current Code (Correct):** Handles multiple Stripe customer IDs via alias pattern
- **Production Code (Outdated):** Throws error when encountering multiple Stripe IDs

The error message `"conflicting customer stripe ids"` does NOT exist in current codebase, proving production is running old code.

### What Should Happen

When a customer has multiple Stripe customer IDs (normal scenario):
1. Query finds existing customer by any Stripe ID: `fetchCustomerByStripeId()`
2. New Stripe ID is appended to `stripeCustomerIds` array via `buildStripeCustomerAliasPatch()`
3. Customer document updated with merged IDs
4. Checkout proceeds normally

### What's Actually Happening (Production)

1. Query finds customer with Stripe ID `cus_TgonYtaRUjUXOZ`
2. Session has different Stripe ID `cus_Th0NSA5EcegRfp`
3. **Production throws error** instead of merging
4. Abandoned checkout document NOT created
5. Cart recovery opportunity LOST

### Why Multiple Stripe IDs Occur

This is **NORMAL and EXPECTED**. Stripe creates multiple customer objects for:
- Guest checkouts (no login)
- Email changes
- Multiple checkout sessions
- Manual creation in dashboard
- Different API interfaces

### Required Fix

**IMMEDIATE ACTION:** Redeploy production with latest code

```bash
cd /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-sanity
git log netlify/functions/stripeWebhook.ts --oneline | head -5
npm run build
# Deploy to Netlify production
```

### Affected Code

**Current (Correct) Implementation:**
- [netlify/functions/stripeWebhook.ts:2648-2757](../netlify/functions/stripeWebhook.ts#L2648-L2757) - `strictFindOrCreateCustomer` with alias handling
- [netlify/lib/stripeCustomerAliases.ts:11-53](../netlify/lib/stripeCustomerAliases.ts#L11-L53) - `buildStripeCustomerAliasPatch`

**Production (Broken) Implementation:**
- Unknown (bundled code at line 72021)
- Predates alias pattern implementation
- Needs immediate replacement

### Data Fix Required

After redeployment, manually fix affected customer:

```typescript
// Query customer
*[_type == "customer" && _id == "ATZnC953ZI6BkOhriZTtDE"][0]{
  _id,
  email,
  stripeCustomerId,
  stripeCustomerIds
}

// Expected: stripeCustomerIds should contain both IDs
// If not, manually patch:
await sanity.patch('ATZnC953ZI6BkOhriZTtDE').set({
  stripeCustomerIds: ['cus_TgonYtaRUjUXOZ', 'cus_Th0NSA5EcegRfp']
}).commit()
```

### Verification Steps

1. ✅ Confirm production deployment includes latest stripeWebhook.ts
2. ✅ Verify customer has both Stripe IDs in array
3. ✅ Retrigger failed webhook: `stripe events resend evt_3SdkJLP1CiCjkLwl0TApxX9N`
4. ✅ Confirm abandoned checkout document created
5. ✅ Monitor logs for "customer stripe alias appended" (success) vs "conflicting customer" (failure)

---

## Issue #2: Webhook Signature Verification (LOCAL DEV)

### Error Details

**File:** `docs/reports/stripe-error-logs/error2.txt`
**Environment:** Local development (localhost:8888)
**Severity:** LOW (dev only)
**Impact:** Cannot test webhooks locally

```
Error: No signatures found matching the expected signature for payload.
Are you passing the raw request body you received from Stripe?
```

### Root Cause

**Webhook signature mismatch** between Stripe and local environment.

Possible causes:
1. `STRIPE_WEBHOOK_SECRET` doesn't match the endpoint
2. Request body modified by middleware
3. Not using Stripe CLI for forwarding
4. Using production webhook secret instead of CLI secret

### Expected Behavior

When using Stripe CLI:
```bash
stripe listen --forward-to localhost:8888/.netlify/functions/stripeWebhook
# Outputs: Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx
```

The `whsec_xxx` secret must match `STRIPE_WEBHOOK_SECRET` in `.env.local`.

### Required Fix

#### Option A: Stripe CLI (Recommended)

```bash
# Terminal 1: Start local server
cd /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-sanity
npm run dev  # Starts localhost:8888

# Terminal 2: Forward webhooks
stripe listen --forward-to localhost:8888/.netlify/functions/stripeWebhook

# Copy the webhook signing secret (whsec_xxx) from output
```

Update `.env.local`:
```bash
# Use the secret from stripe listen output, NOT from Stripe Dashboard
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

Restart server after updating `.env.local`.

#### Option B: Skip Verification in Dev (Testing Only)

⚠️ **WARNING: NEVER use in production**

```typescript
// netlify/functions/stripeWebhook.ts (around line 7234)
const isDev = process.env.NODE_ENV !== 'production' || process.env.NETLIFY_DEV === 'true'

if (isDev && process.env.STRIPE_WEBHOOK_NO_VERIFY === 'true') {
  console.warn('⚠️  SKIPPING STRIPE SIGNATURE VERIFICATION (DEV ONLY)')
  evt = JSON.parse(event.body)
} else {
  evt = stripe.webhooks.constructEvent(event.body, sig as string, secret)
}
```

Add to `.env.local`:
```bash
STRIPE_WEBHOOK_NO_VERIFY=true  # ONLY FOR LOCAL TESTING
```

### Verification Steps

1. ✅ Stripe CLI running and forwarding to localhost:8888
2. ✅ `STRIPE_WEBHOOK_SECRET` in `.env.local` matches CLI output
3. ✅ Local server restarted after env change
4. ✅ Test webhook: `stripe trigger charge.succeeded`
5. ✅ Webhook processes without signature error

### Why This Doesn't Affect Production

- Production uses webhook endpoint secret from Stripe Dashboard
- Signature verification works correctly in production
- This is ONLY a local development configuration issue

---

## Impact Comparison

| Aspect | Issue #1 (Customer Conflict) | Issue #2 (Signature) |
|--------|----------------------------|---------------------|
| **Environment** | Production | Local dev |
| **User Impact** | HIGH - Lost cart recovery | NONE - Dev only |
| **Data Loss** | YES - Abandoned checkouts | NO |
| **Urgency** | IMMEDIATE | Low |
| **Fix Complexity** | Simple redeploy | Config change |
| **Risk** | Production outage | None |

---

## Action Plan

### Phase 1: CRITICAL (Today)

**Goal:** Fix production customer identity conflict

1. [ ] Verify current production deployment version
2. [ ] Redeploy fas-sanity with latest stripeWebhook.ts
3. [ ] Query affected customer `ATZnC953ZI6BkOhriZTtDE`
4. [ ] Manually patch if needed (add both Stripe IDs to array)
5. [ ] Retrigger failed webhook
6. [ ] Monitor for 24 hours - watch for "customer stripe alias appended" logs

**Success Criteria:**
- No more "conflicting customer stripe ids" errors
- Abandoned checkouts being created successfully
- Customer has both Stripe IDs in `stripeCustomerIds` array

### Phase 2: Development (This Week)

**Goal:** Fix local webhook testing

1. [ ] Install/update Stripe CLI: `brew install stripe/stripe-cli/stripe`
2. [ ] Run `stripe listen --forward-to localhost:8888/.netlify/functions/stripeWebhook`
3. [ ] Update `.env.local` with CLI webhook secret
4. [ ] Test webhook locally: `stripe trigger checkout.session.completed`
5. [ ] Document process in README or development docs

**Success Criteria:**
- Can test webhooks locally without signature errors
- Development workflow documented
- Team knows how to set up local webhook testing

---

## Prevention

### Monitoring

Set up alerts for:
- Webhook signature verification failures (>5 per hour)
- Customer identity conflicts (any occurrence)
- Abandoned checkout creation failures (>10% drop)
- `handleCheckoutExpired` errors

### Testing

Add automated tests:
```typescript
// Test multiple Stripe customer IDs
describe('Customer Stripe ID Aliases', () => {
  it('should append new Stripe ID without error', async () => {
    const customer = await createTestCustomer({
      stripeCustomerId: 'cus_test123',
      stripeCustomerIds: ['cus_test123']
    })

    const session = createTestSession({
      customer: 'cus_different456',
      customer_details: { email: customer.email }
    })

    const result = await strictFindOrCreateCustomer(session)

    expect(result.stripeCustomerIds).toContain('cus_test123')
    expect(result.stripeCustomerIds).toContain('cus_different456')
  })
})
```

### Documentation

Add to CLAUDE.md:
- Customer can have multiple Stripe IDs (normal behavior)
- Alias pattern handles this automatically
- Never throw errors for multiple IDs - append to array

---

## Related Documentation

- **Detailed Audit:** [stripe-webhook-customer-conflict-audit.md](./stripe-webhook-customer-conflict-audit.md)
- **Customer Schema:** [packages/sanity-config/src/schemaTypes/documents/customer.ts](../../packages/sanity-config/src/schemaTypes/documents/customer.ts)
- **Alias Implementation:** [netlify/lib/stripeCustomerAliases.ts](../../netlify/lib/stripeCustomerAliases.ts)
- **Webhook Handler:** [netlify/functions/stripeWebhook.ts](../../netlify/functions/stripeWebhook.ts)

---

## Questions for Review

1. **When was last production deployment?** Check if it includes alias pattern
2. **How many customers affected?** Query for customers with missing `stripeCustomerIds`
3. **How many webhooks failed?** Search logs for "conflicting customer" errors
4. **Should we merge Stripe customers?** Decide if `cus_TgonYtaRUjUXOZ` and `cus_Th0NSA5EcegRfp` should be merged in Stripe Dashboard

---

**Prepared by:** Claude (Audit Agent)
**Last Updated:** 2026-01-03
**Status:** Awaiting Production Deployment
