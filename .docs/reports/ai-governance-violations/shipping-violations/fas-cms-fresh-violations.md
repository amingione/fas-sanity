```bash
rg -n "shipping_options|shipping_rate_data|fixed_amount|update_shipping_details|permissions\\.update_shipping_details" .
```

[output]
.docs/reports/ai-governance-violations/shipping-violations/fas-cms-fresh-violations.md

```bash
./TEST_PARCELCRAFT_TRANSIT_TIMES.md
29:- Never sets `shipping_options`

./STRIPE_PARCELCRAFT_VERIFICATION.md
16:- ✅ Checkout never sets `shipping_options` (Parcelcraf
t supplies dynamic rates) 70: -d '{"cart": [{"id": "test-product", "name": "Test
", "price": 100, "quantity": 1, "weight": 3, "weight_unit" : pounds, "dimensions": {"length": 10, "width": 5, "height": 2}}], "shipping_options" : "mode": "payment", "success_url": "https://fasmotorsports.com/success", "cancel_url": "https:/fasmotorsports.com/cancel"}'
./src/pages/api/stripe/create-checkout-session.ts
990: // and invoice_creation is true. Do NOT manually
pass shipping_options as it overrides Parcelcraft.
./src/server/sanity/promotions.ts
64: } else if (promotion.discountType === 'fixed_amount
') { 76: } else if (promotion.discountType === 'fixed_amount
') {
```

---

# ISSUE A — Documentation examples contradict the contract

Found in:
`STRIPE_PARCELCRAFT_VERIFICATION.md` in [fas-cms-fresh]

Problem:
• prose says “never set shipping_options”
• example payload includes shipping_options

This is exactly how AI systems drifted.

📌 This must be cleaned later.

But importantly:

🚫 This does NOT explain why shipping isn’t showing at checkout.

This explains why Codex kept reintroducing bad logic.

Different problem.

⸻

## ISSUE B — The checkout flow is likely correct, but Stripe-side configuration may not be

Since code is not defining shipping_options, and is allowing address collection, the remaining possibilities are Stripe-side only:
• Parcelcraft app configuration
• Shipping countries mismatch
• Product shipping eligibility
• Stripe shipping profiles
• Connected carriers not active
• Test vs live mode mismatch

---

[command]

```bash
rg -n "checkout\\.sessions\\.create\\(" src
src/pages/api/stripe/create-checkout-session.ts
```

[terminalOutput]

```bash
1017:    const session = await stripe.checkout.sessions.create(sessionParams);
```
