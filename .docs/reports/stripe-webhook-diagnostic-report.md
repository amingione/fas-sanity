# Stripe Webhook Diagnostic Report

## Overall Statistics
- Total webhook function logs: 442
- Success rate: 73.8% (326 successful)
- Error rate: 26.2% (116 errors)
- Signature verification failures: 116 errors
- Empty cart terminal failures: 7 failures (4 unique sessions)

## Issue 1: Signature Verification Failures

### Problem
116 webhook requests failed signature verification on January 2, 2026 around 8:51 AM.

### Root Cause Analysis
Error message:
"No signatures found matching the expected signature for payload. Are you passing the raw request body you received from Stripe?"

What is happening:
- The local functions server (`local-functions-server.ts` line 120) is modifying the request body before passing it to the Stripe webhook handler.
- Stripe signature verification requires the exact raw bytes as received.
- Any parsing, stringifying, or encoding changes break the signature.

### Evidence
- All 116 errors occurred within a 2-second window (08:51:02 to 08:51:04).
- All have identical error messages.
- All show `metadata.webhookStatus: "processed"` (suggesting the handler tried to process them).
- The `eventData` field is null (webhook rejected before event parsing).

### Impact
- Severity: HIGH in production, MEDIUM in development.
- These webhooks were completely rejected and never processed.
- In production, this would mean lost orders and payment tracking failures.
- Currently only affecting local development.

### Fix Required
Do not parse the body before verification. Pass the raw body to Stripe:

```ts
// Wrong: breaks signature verification
const body = JSON.parse(request.body)
const event = stripe.webhooks.constructEvent(body, sig, secret)

// Correct: pass raw string or Buffer
const event = stripe.webhooks.constructEvent(
  request.body,
  sig,
  secret
)
```

### Action Items
- Check `local-functions-server.ts` line 120 and ensure it preserves raw request body.
- Verify the webhook signing secret matches the Stripe dashboard.
- Do not call `JSON.parse()` before signature verification.
- Use `body-parser` with the `verify` option to preserve the raw body.

## Issue 2: Empty Cart Terminal Failures

### Problem
4 checkout sessions completed with payment collected but no cart data, resulting in terminal failures.

### Affected Sessions
| Session ID | Amount | Time | Customer |
| --- | --- | --- | --- |
| `cs_test_a1YcYbkIqJkGfHDZESOA0GCCeNI5kc8dQNuxO8psJDWkVaMpvZyuAgnO38` | $15.00 | Jan 2, 9:50 AM | Amber Mingione |
| `cs_test_a1Zzr8syDgbpWGL3yu9XO0xz4HwSiKmcptgFOMLeJy6CZUTnq7wD5RYvrJ` | $15.00 | Jan 2, 9:38 AM | Amber Mingione |
| `cs_test_a1nisQ0g8gp99tHHqzUhge2nh09MBs2XNeLlsP8ADPirzlqZYrpWpinURx` | Unknown | Jan 2, 9:21 AM | Unknown |
| `cs_test_a1kIAKxC2MKqfsNgYjcWyLdNlN9qAXYvbrvImWRMagMnFgmBgz4NTL5wgk` | Unknown | Jan 2, 8:07 AM | Unknown |

### Root Cause Analysis
What is present in the data:
- `CheckoutSession` documents exist but have `cart: null`.
- Payment was collected ($15.00 per session).
- Metadata exists with test order numbers (e.g. `TEST-ORDER-001`).
- Customer reference is valid (links to your customer record).
- Documents are marked with `failureReason: "empty_cart_line_items"` and `invalidCart: true`.

Working checkouts include cart data and metadata:

```json
{
  "cart": [
    {
      "_key": "fc4c5e96-7de8-420d-aeb1-418117f626da",
      "imageUrl": "https://cdn.sanity.io/images/...",
      "price": 899.99,
      "productId": "659b11e9-3409-4041-8580-64a62e17d221",
      "productName": "6\" Axel-Back Exhaust (2011+ 6.7L Powerstroke)",
      "quantity": 1,
      "slug": "fas-6-axel-back-exhaust-2011-6-7l-powerstroke"
    }
  ]
}
```

```json
{
  "metadata": {
    "cart": "[{\"i\":\"product-id\",\"n\":\"Product Name\",\"q\":1,\"p\":199.99}]",
    "cart_summary": "Product Name - Qty: 1 | Other Product - Qty: 2"
  }
}
```

Failed test checkouts have:

```json
{
  "cart": null,
  "metadata": {
    "raw": "{\"sanity_order_number\":\"TEST-ORDER-001\"}"
  }
}
```

Likely scenarios:
- Test checkout created without cart data (manual Stripe session).
- Checkout creation code did not serialize cart data to Stripe metadata.
- Race condition clears cart before checkout completes.

### Evidence This Is Test Data
- All sessions are `cs_test_*` (test mode).
- Order number is `TEST-ORDER-001` (hardcoded test value).
- Same customer used for testing.
- Metadata includes `user_id: "auth0|test-user-123"` (test user).
- Amounts are low ($15.00) compared to real orders ($384 to $1,208).

### Impact
- Severity: LOW (test data only).
- Financial impact: $60 in test payments (4 x $15).
- Production risk: MEDIUM if this occurs in production.
- Webhook handler correctly rejected these as `failed_terminal`.

### What the System Did Right
- Detected the empty cart.
- Marked as `failed_terminal` (no retry).
- Logged the failure reason.
- Created `checkoutSession` documents for tracking.
- Prevented order creation without products.

## Pattern Analysis

### Orders Have a Systemic Issue
9 orders for customer Amber Mingione all have `lineItems: null` (paid, refunded, and cancelled).
This suggests:
- Order creation is not populating line items.
- Line items are stored elsewhere (separate document type).
- Or this is expected for the schema design.

### Abandoned Checkouts Work Correctly
10+ abandoned checkouts have proper cart data, consistent structure, and required fields.

### Successful Production Checkouts Work
Example from Dec 26, 2025:
- Customer: Jason Shanas
- Amount: $384.94
- Cart data passed through Stripe metadata.
- Order created and linked properly.

## Recommendations

### Immediate Actions
- Fix signature verification in local dev (preserve raw request body).
- Test with Stripe CLI:
  `stripe listen --forward-to localhost:8888/.netlify/functions/stripeWebhook`
- Investigate why all orders have `lineItems: null`.
- Add checkout validation to prevent empty carts:

```ts
if (!cart || cart.length === 0) {
  throw new Error('Cannot checkout with empty cart')
}
```

### Long-Term Improvements
- Add monitoring alerts for `failed_terminal` and signature verification failures.
- Track empty cart checkout attempts.
- Improve test data hygiene (consistent test order numbers and cleanup).
- Add test mode indicators in UI.
- Add cart validation in frontend and backend.
- Document expected order schema structure and references.

## Open Questions
- Are line items supposed to be null in orders, or is this a bug?
- Is there a separate document type for order line items?
- Were empty cart checkouts intentional tests or accidental?
- Is the signature verification issue only local or also in production?
- Should we investigate order creation logic to fix line items?
