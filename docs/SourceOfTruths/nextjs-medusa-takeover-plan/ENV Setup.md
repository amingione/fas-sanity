<!--AGENT_REASONING:complete:10:["Firing up the neurons"]-->

## Status Summary

| Update | Details |
|--------|---------|
| Webhook Paths | Both live with fail-closed behavior. |
| 1. Stripe Payment Intent | Live on dedicated Netlify site: https://fas-webhook-ingress-20260211.netlify.app/api/medusa/webhooks/payment-intent |
| 2. Shippo Ingress | On Sanity site, forwards to local Medusa via tunnel: https://fassanity.fasmotorsports.com/webhooks/shippo |
| 3. Runtime Crash Patch | Fixed in `fas-cms-fresh/src/pages/api/complete-order.ts` (lines 21 & 330), redeployed. |
| 4. Production Deploys | - fas-webhook-ingress-20260211: 698c6db5eaf2e62d5db7bd41 (ready)<br>- fassanity: 698c699b1c2f4499586ad75b (ready) |

## Final Endpoints

| Endpoint | Description | Configuration |
|----------|-------------|---------------|
| 1. Stripe Webhook | https://fas-webhook-ingress-20260211.netlify.app/api/medusa/webhooks/payment-intent | Event: `payment_intent.succeeded` (Stripe Dashboard) |
| 2. Complete-Order API | https://fas-webhook-ingress-20260211.netlify.app/api/complete-order | Payload: snake_case (`cart_id`, `payment_intent_id`) |
| 3. Shippo Webhook | https://fassanity.fasmotorsports.com/webhooks/shippo | Configure in Shippo |
| 4. Local Medusa Target | https://unit-elevation-limits-gbp.trycloudflare.com/webhooks/shippo | Via tunnel |

## Env Runbook

### Site: fas-webhook-ingress-20260211 (NETLIFY_SITE_ID=334cf000-980e-414d-9450-dc983ac92279)

| Required Env Key                             | Value/Example         |
| -------------------------------------------- | --------------------- |
| STRIPE_SECRET_KEY                            | (Required)            |
| STRIPE_WEBHOOK_SECRET                        | (Required)            |
| SANITY_PROJECT_ID                            | (Required)            |
| SANITY_DATASET                               | (Required)            |
| SANITY_API_TOKEN                             | (Required)            |
| MEDUSA_API_URL                               | Cloudflare tunnel URL |
| MEDUSA_PUBLISHABLE_KEY                       | (Required)            |
| PAYMENT_INTENT_WEBHOOK_FORWARD_ENABLED       | `false`               |
| PAYMENT_INTENT_WEBHOOK_LOCAL_PROCESS_ENABLED | `true`                |
| PAYMENT_INTENT_WEBHOOK_FORWARD_FAIL_OPEN     | `false`               |
| WEBHOOK_FORWARD_TIMEOUT_MS                   | `10000`               |

### Site: fassanity (NETLIFY_SITE_ID=43b3d2f9-45f1-444a-8672-48a8694cba5b)

| Required Env Key | Value/Example |
|------------------|---------------|
| SHIPPO_WEBHOOK_FORWARD_URL | `https://<current-tunnel>/webhooks/shippo` |
| SHIPPO_WEBHOOK_FORWARD_ENABLED | `true` |
| SHIPPO_WEBHOOK_FORWARD_FAIL_OPEN | `false` |
| WEBHOOK_FORWARD_TIMEOUT_MS | `10000` |

### Tunnel Lifecycle (Medusa Local Only)

1. **Start**: `npx -y cloudflared tunnel --url http://localhost:9000 --no-autoupdate`
2. **Confirm Listener**: `lsof -i :9000`
3. **If URL Rotates**: Update `MEDUSA_API_URL` (ingress site) & `SHIPPO_WEBHOOK_FORWARD_URL` (fassanity)

## Verification Evidence

| Test | Result |
|------|--------|
| 1. POST /api/complete-order | 200 `{"warning":"Order may be completed via webhook","details":"No such payment_intent: 'pi_test_missing'"}` |
| 2. Stripe Signature Enforcement | 400 `{"received":false,"error":"Missing stripe-signature header"}` |
| 3. Shippo Forwarding E2E | POST to https://fassanity.fasmotorsports.com/webhooks/shippo → 200 `{"received":true,"message":"Tracking event acknowledged. Fulfillment handled externally."}` |
| 4. Direct Tunnel Probe | To Medusa shippo route → 200 acknowledgment |

**Note**: Explicit STOP - Wiring and runbook complete. The original TOC config can stay for navigation.
