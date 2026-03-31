// Deprecated stub: stripeWebhook
/**
 * DEPRECATED — returns 410 Gone.
 *
 * This function previously called Stripe/Shippo directly, violating AGENTS.md.
 * All payment and fulfillment is now handled by Medusa (fas-medusa on Railway).
 * This stub exists to return a proper 410 so any stale integrations fail loudly.
 *
 * DO NOT restore this function. See AGENTS.md for the correct architecture.
 */
import type { Handler } from "@netlify/functions";

export const handler: Handler = async () => ({
  statusCode: 410,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify({
    error: "Gone",
    message:
      "This endpoint has been permanently removed. Payments and fulfillment are handled by Medusa. See https://api.fasmotorsports.com",
    code: "DEPRECATED_DIRECT_STRIPE",
  }),
});
