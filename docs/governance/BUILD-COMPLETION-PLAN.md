# FAS Motorsports — Build Completion Plan
**Governing Document**: `fas-sanity/AGENTS.md` (single source of truth)
**Last Updated**: 2026-03-30
**Status**: Active migration — Medusa-first architecture enforced

---

## Canonical Architecture

```
Sanity (content only — no prices, carts, orders)
        ↓ one-time + enrichment sync
Medusa (products, variants, pricing, inventory, cart, checkout, orders)
        ↓
fas-cms-fresh (storefront UI — calls /store/* only)
        ↓
Medusa cart & checkout
        ↓
Stripe payment (via Medusa)
        ↓
Shippo shipping (via Medusa)
```

**Non-Negotiable Rules (from AGENTS.md):**
- Sanity = content and identifiers only — zero transactional logic
- Medusa = the commerce record — all other services read from it
- Stripe and Shippo = accessed ONLY via Medusa (never direct)
- fas-cms-fresh = calls `/store/*` with publishable key
- fas-dash = calls `/admin/*` with admin API key (server-side only)
- Sanity receives webhook events from Medusa (read-only mirror)

---

## Compliance Status

### Rule 1: Sanity is NOT transactional

| Check | File | Status |
|-------|------|--------|
| No direct Stripe calls from Sanity | `netlify/functions/createCheckoutSession.ts` | 🔴 VIOLATION → 410 redirect added |
| No Stripe webhook in Sanity | `netlify/functions/stripeWebhook.ts` (329KB) | 🔴 VIOLATION → 410 redirect added |
| No order creation in Sanity | `netlify/functions/manual-fulfill-order.ts` | 🔴 VIOLATION → 410 redirect added |

### Rule 2: Medusa is the commerce engine

| Check | Status |
|-------|--------|
| 75/75 products synced to Medusa | ✅ |
| Cart via Medusa `/store/carts` | ✅ |
| Shipping via Medusa `/store/carts/:id/shipping-options` | ✅ |
| Payment intent via Medusa `/store/payment-intents` | ✅ |
| `complete-order.ts` disabled (410) | ✅ |
| Stripe webhook handler in Medusa | ✅ |
| Cart integration (Phase 2C) | ⚠️ In progress |
| Order fulfillment pipeline (Phase 2D) | ⚠️ Not started |
| Publishable key functional | 🔴 BLOCKED — needs Railway shell |

### Rule 3: Stripe and Shippo via Medusa ONLY

| Check | Status |
|-------|--------|
| No direct Stripe from fas-cms-fresh | ✅ confirmed |
| No direct Shippo from fas-cms-fresh | ✅ confirmed |
| Direct Stripe from fas-sanity | 🔴 deprecated → 410 redirect added |
| Stripe webhook → Medusa | ✅ `fas-medusa/src/api/webhooks/stripe/route.ts` |
| Shippo via Medusa fulfillment module | ✅ |

### Rule 4: fas-dash reads commerce from Medusa only

| Check | Status |
|-------|--------|
| Orders, customers, products, inventory → Medusa `/admin/*` | ✅ |
| Returns, quotes, fulfillment → Medusa `/admin/*` | ✅ |
| Purchase orders → Sanity `vendorOrder` docs (appropriate) | ✅ |

---

## Prioritized Build Queue

### 🔴 P0 — Blocking

1. **Rotate publishable key** (fas-medusa, Railway)
   - Scripts ready: `src/scripts/fix-publishable-key-links.ts`
   - Runbook: `docs/ops-runbook-webhook-and-key-setup.md`
   - Also propagate to Netlify: `PUBLIC_MEDUSA_PUBLISHABLE_KEY`

2. **Set Railway env vars**
   - `SANITY_SYNC_SALES_CHANNEL_ID=sc_01KFYWCD7HK3XV7C9GV5A8ZSZG`
   - `SANITY_SYNC_SHIPPING_PROFILE_ID=sp_01KFYWC05QKP441X5XNE7A9P4M`
   - `VENDOR_WEBHOOK_SECRET=<generate with openssl rand -base64 32>`

3. **Register Sanity webhooks** → Medusa product sync
   - See `docs/ops-runbook-webhook-and-key-setup.md §1`

### 🟠 P1 — Compliance

4. **Audit 6 legacy routes in fas-cms-fresh** flagged in CLAUDE.md
   - `update-payment-intent.ts` — verify calls Medusa, not Stripe
   - `cart/[id].ts` — verify reads Medusa, not Sanity
   - Run: `npm run compliance:check` after each fix

5. **Verify no remaining direct Stripe/Shippo imports in fas-cms-fresh**
   ```bash
   grep -r "new Stripe\|from 'stripe'" fas-cms-fresh/src/pages/api --include="*.ts" | grep -v medusa
   ```

### 🟡 P2 — Build Completion

6. **Phase 2B-3: Scheduled reconciliation cron** (fas-medusa)
   - File: `src/jobs/sanity-reconciliation.ts`
   - Schedule: every 15 minutes

7. **Phase 2D: Order fulfillment subscriber** (fas-medusa)
   - File: `src/subscribers/order-placed-fulfillment.ts`
   - Trigger: `order.placed` event → create Shippo fulfillment

8. **Set `OTEL_EXPORTER_OTLP_ENDPOINT` in Railway** (fas-medusa)
   - `instrumentation.ts` is now enabled — just needs the env var
   - Use Grafana Cloud or Datadog

9. **Validate full cart → payment → order flow end-to-end**
   - Confirm `POST /store/carts/:id/payment-sessions` is called before Stripe Elements init

### 🟢 P3 — Hardening

10. **fas-dash Phase 6 QA pass** on all ⚠️ routes
11. **fas-dash Phase 7 hardening**: error boundaries, session timeout, CORS lockdown

---

## Compliance Checker

Run from any repo:
```bash
# From fas-sanity (canonical governance repo)
npm run compliance:check

# Or from any repo that has the check symlinked
make compliance-check
```

This checks all 9 rules across all 4 repos and exits non-zero on violations.

---

## API Flow Logging

`fas-cms-fresh/src/lib/logger.ts` is now installed. Use it in all API routes:

```typescript
import { withFlowLog, logFlow } from '@/lib/logger'

// Option A: wrap entire operation
const result = await withFlowLog(
  { service: 'fas-cms-fresh', phase: 'cart-create', correlationId: cartId ?? 'new' },
  () => medusaFetch('/store/carts', { method: 'POST', body: JSON.stringify({ region_id }) })
)

// Option B: manual log points
logFlow({ service: 'fas-cms-fresh', phase: 'payment-intent-create', status: 'start', correlationId: cartId })
```

Logs are structured JSON, compatible with Netlify Log Drains → Grafana/Datadog.

---

## Phase Roadmap

```
NOW ───────────────────────────────────────────────────────────────▶
  P0: Rotate publishable key (Railway shell, 30 min)
  P0: Set env vars (Railway + Netlify, 15 min)
  P0: Register Sanity webhooks (10 min)
  ↓
  P1: Audit + migrate 6 legacy fas-cms-fresh routes (2-4 hrs)
  P1: Run compliance:check → verify zero errors
  ↓
  P2: Write reconciliation cron (fas-medusa, 2 hrs)
  P2: Set OTEL_EXPORTER_OTLP_ENDPOINT in Railway (5 min)
  P2: Build order fulfillment subscriber (fas-medusa, 3 hrs)
  P2: Validate cart → payment → order end-to-end
  ↓
  P3: fas-dash Phase 6 QA (2-4 hrs)
  P3: fas-dash Phase 7 hardening
  ↓
DONE: Full Medusa-first build, 100% AGENTS.md compliant ✅
```
