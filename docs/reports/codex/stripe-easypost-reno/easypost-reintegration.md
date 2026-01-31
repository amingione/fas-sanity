## fas-cms-fresh (storefront)

- `src/pages/api/stripe/shipping-rates-webhook.ts` — Switched rate calculation to direct EasyPost API calls and removed fas-sanity dependency; ensures checkout rates do not depend on CMS availability.
- `src/pages/api/stripe/create-checkout-session.ts` — Removed Parcelcraft metadata references, kept Stripe shipping address collection, and normalized logging/metadata naming; aligns checkout session creation with EasyPost-driven rates.
- `src/pages/api/webhooks.ts` — Removed `payment_intent.updated` Parcelcraft sync logic; prevents legacy metadata updates that are no longer valid.
- `src/pages/api/shipping/quote.ts` — Updated disabled endpoint messaging to Stripe Checkout-only; removes legacy provider mention.
- `src/pages/api/status.ts` — Changed shipping provider label to `easypost`; reflects current integration.
- `src/components/checkout/EmbeddedCheckout.tsx` — Reworded checkout error messaging to generic shipping config; removes Parcelcraft-specific guidance.
- `src/pages/checkout/index.astro` — Updated comment to EasyPost; aligns docs/comments with current provider.
- `src/checkout/checkoutState.ts` — Changed rate provider type to `easypost`; removes legacy type.
- `netlify/functions/_inventory.ts` — Changed tracking event source label to `easypost`; keeps fulfillment attribution consistent.
- `.env.example` — Removed Parcelcraft env flags and added EasyPost + warehouse fields with real address; required for direct rate calculation.
- `QUICK_SETUP.md` — Replaced SANITY_BASE_URL guidance with EasyPost env vars and updated troubleshooting; aligns setup with direct EasyPost usage.
- `WEBHOOK_SETUP_GUIDE.md` — Removed fas-sanity dependency instructions and replaced with EasyPost env details; reflects checkout-only rate flow.
- `SHIPPING_INTEGRATION.md` — Rewrote flow diagrams/steps to direct EasyPost calls, removed fas-sanity rate references, and adjusted troubleshooting/FAQ; matches approved responsibilities.
- `IMPLEMENTATION_STATUS.md` — Updated env list and flow to remove fas-sanity rate calls; keeps status accurate.
- `EMBEDDED_CHECKOUT_FIX.md` — Removed Parcelcraft references in guidance; reflects current checkout flow.
- `scripts/create-test-checkout-with-shipping.ts` — Updated metadata keys and messaging for EasyPost-driven shipping; ensures test aligns to new metadata.
- `scripts/list-recent-checkout-sessions.ts` — Updated follow-up command to new script name; removes Parcelcraft reference.
- `scripts/check-parcelcraft-transit-times.ts` — Removed Parcelcraft-specific messaging; keeps legacy filename but neutral content.
- `scripts/check-shipping-transit-times.ts` — New script for rate inspection without legacy naming; supports current debugging.
- `scripts/parcelcraft-diagnostic.ts` — Updated to generic shipping diagnostics and new metadata keys; removes provider-specific guidance.
- `scripts/delete-static-shipping-rates.ts` — Updated warnings to dynamic rates (no Parcelcraft); aligns with current checkout setup.
- `scripts/shipping-tests/01-quote-idempotency.sh` — Deprecated script because checkout no longer calls fas-sanity for quotes; prevents stale usage.
- `scripts/shipping-tests/03-label-replay.md` — Updated to `easypostShipmentId`; reflects label workflow.

## fas-sanity (back-office)

- `netlify/functions/stripeShippingRateCalculation.ts` — Disabled with a 410 response and removed unused logic; ensures fas-sanity does not handle checkout rate calculation.
- `netlify/functions/getShippingQuoteBySkus.ts` — Removed Parcelcraft metadata payloads; keeps EasyPost quote output clean.
- `netlify/functions/stripeWebhook.ts` — Removed Parcelcraft metadata parsing and payment_intent.updated sync; avoids legacy shipping updates.
- `netlify/lib/fulfillmentFromMetadata.ts` — Removed Parcelcraft key fallbacks; keeps metadata parsing limited to EasyPost/Stripe.
- `netlify/functions/createCheckoutSession.ts` — Updated comments to remove Parcelcraft references; documentation alignment only.
- `.env.example` — Set `shipping_method=easypost`; removes legacy provider hint.
- `EASYPOST_DEPLOYMENT.md` — Replaced Parcelcraft note with EasyPost-only stance; documentation alignment.
- `codex.md` — Updated comments that referenced Parcelcraft; aligns governance messaging.
- `CLAUDE.md` — Updated comment line for shipping rates; removes Parcelcraft reference.
- `docs/ai-governance/guards/no-easypost-in-storefront.md` — Disabled guard text; removes EasyPost blocking rules.
- `scripts/check-shipping-guards.sh` — Updated output message; removes Parcelcraft mention.
- `tests/fixtures/checkout.canonical.json` — Updated rateId placeholder to `easypost_*`; aligns test fixture naming.

## Documentation Touch-Ups (Parcelcraft term removal)

Replaced Parcelcraft terminology with neutral “legacy provider” references in these docs:
- `docs/ai-governance/guards/no-parcelcraft-in-sanity.md`
- `docs/ai-governance/contracts/shipping-provider-boundaries.md`
- `docs/ai-governance/skills/easypost-internal-shipping-operator.md`
- `docs/ai-governance/skills/stripe-shipping-integration-architect.md`
- `docs/archive/parcelcraft-dynamic-shipping.md`
- `docs/archive/parcelcraft-setup-docs/1-gettingStarted.md`
- `docs/archive/parcelcraft-setup-docs/2-installParcelcraft.md`
- `docs/archive/parcelcraft-setup-docs/3.-better-rates.md`
- `docs/archive/parcelcraft-setup-docs/define-shippable-products.md`
- `docs/archive/parcelcraft-setup-docs/parcelcraft-stripe-API-guide-complete.md`
- `docs/archive/parcelcraft-setup-docs/set-carrier-defaults.md`
- `docs/archive/parcelcraft-setup-docs/setup-stripe-invoicing.md`
- `docs/prompts/easypost-in-fas-cms-fresh-no-more-parcelcraft.md`
- `docs/prompts/gemini-shipping-architecture-reset-audit.txt`
- `docs/prompts/codex/TASK-database-handover-plan.md`
- `docs/prompts/codex/checkout-fix.md`
- `docs/prompts/claude-dec/shipping-architexture-reset.md`
- `docs/reports/easypost-reversion-audit.md`
- `docs/reports/easypost-reversion-1b.md`
- `docs/reports/easypost-reversion-plan.md`
- `docs/reports/shipping-architecture-lock.md`
- `docs/reports/SANITY AGENT/sanity-snippets.md`
- `docs/reports/SANITY AGENT/STUDIO CONTENT AI/AUDIT_SUMMARY.md`

## Files Deleted

- `archive/` — Removed archived Parcelcraft integration remnants.
- `SHIPPING_ARCHITECTURE_AUDIT.md` — Removed legacy architecture audit referencing Parcelcraft.
- `OPTION_A_IMPLEMENTATION.md` — Removed legacy implementation plan tied to Parcelcraft.
- `tools/ai-governance/guards/stripe-parcelcraft-shipping.json` — Removed Parcelcraft-only governance guard.
