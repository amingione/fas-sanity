# ✅keep as a safeguard so duplicate orders do not happen

Checked your log against stripeWebhook.ts in fas-sanity — the output matches the current handler flow and the duplicate‑event guard.

What lines map to the code

🧪 stripeWebhook: resolved env vars ... stripeSecretKeySet/stripeWebhookSecretSet/... comes from the env dump in stripeWebhook.ts around the handler start.
Function stripeWebhook invoked, Has RESEND_API_KEY, Has SANITY_API_TOKEN are logged right after the handler starts (same file).
📥 Webhook received: checkout.session.completed is logged immediately after event parsing.
⏭️ Duplicate event ignored is logged when an existing stripeWebhook.<eventId> document already has a status.
💾 Writing webhook event to Sanity + ✅ Webhook event written to Sanity comes from recordStripeWebhookEvent (it always writes/updates the stripeWebhook doc, even on duplicate).
⚠️ stripeWebhook: exiting early { reason: 'duplicate event' } is the early return for duplicates.
What this implies

The webhook was intentionally short‑circuited because Sanity already had a stripeWebhook.<eventId> doc with a status. That’s why no order creation happens in this run.
This is expected behavior per the duplicate guard in stripeWebhook.ts (the check is based on existing doc status, not the Stripe event id alone).
If you want the event to process anyway, we should inspect the stripeWebhook.<eventId> doc in Sanity to see why it was marked (or clear the status for a re‑run). If you want, tell me the event id and I can trace the exact document path/fields in the code.

---

claude i need help with deciding if
