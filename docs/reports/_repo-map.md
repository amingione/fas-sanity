# Repo Map (fas-sanity + fas-cms-fresh)

## fas-sanity (Sanity Studio + schemas + Netlify functions)

- Location: `/Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-sanity`
- Schema root: `packages/sanity-config/src/schemaTypes`
- Key document schemas (audit scope):
  - Customers: `packages/sanity-config/src/schemaTypes/documents/customer.ts`
  - Vendors: `packages/sanity-config/src/schemaTypes/documents/vendor.ts`
  - Orders: `packages/sanity-config/src/schemaTypes/documents/order.tsx`
  - Invoices: `packages/sanity-config/src/schemaTypes/documents/invoiceContent.tsx`
  - Quotes: `packages/sanity-config/src/schemaTypes/documents/quoteContent.tsx`
  - Quote requests/build quotes: `packages/sanity-config/src/schemaTypes/documents/quoteRequest.ts`, `packages/sanity-config/src/schemaTypes/objects/buildQuote.ts`
  - Discounts (customer-level): `packages/sanity-config/src/schemaTypes/objects/customerDiscountType.ts`
  - Messages: `packages/sanity-config/src/schemaTypes/documents/customerMessage.ts`, `packages/sanity-config/src/schemaTypes/documents/vendorMessage.ts`
- Studio structure (audit-relevant):
  - Orders list: `packages/sanity-config/src/structure/orderStructure.ts`
  - Stripe customer discounts list (derived): `packages/sanity-config/src/structure/discountsStructure.ts`, `packages/sanity-config/src/structure/discountsList.tsx`
- Netlify functions / integrations (audit-relevant):
  - Stripe: `netlify/functions/stripeWebhook.ts`, `netlify/functions/syncStripeCatalog.ts`, `netlify/functions/createCustomerDiscount.ts`
  - EasyPost: `netlify/functions/easypostWebhook.ts`
  - SMS (Twilio): `netlify/functions/notify-sms.ts`

## fas-cms-fresh (Astro frontend + API routes)

- Location: `/Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-cms-fresh`
- Sanity clients:
  - Server: `src/server/sanity-client.ts`
  - Browser/shared: `src/lib/sanityClient.ts`
- Key API routes (audit scope):
  - Auth/session: `src/server/auth/session.ts`, `src/pages/api/auth/login.ts`, `src/pages/api/auth/signup.ts`
  - Checkout + Stripe webhooks: `src/pages/api/checkout.ts`, `src/pages/api/webhooks.ts`
  - Orders: `src/pages/api/save-order.ts`, `src/pages/api/get-user-order.ts`, `src/pages/api/orders/[id].ts`, `src/pages/api/admin/orders/[id].ts`
  - Invoices: `src/pages/api/get-user-invoices.ts`, `src/pages/api/vendor/invoices/[id].ts`, `src/pages/api/vendor/invoices/[id]/pay.ts`
  - Quotes: `src/pages/api/get-user-quotes.ts`, `src/pages/api/save-quote.ts`, `src/pages/api/build-quote.ts`
  - Vendors/portal: `src/pages/api/vendor/login.ts`, `src/pages/api/vendor/me.ts`, `src/pages/api/vendor/messages/index.ts`, `src/pages/api/vendor/messages/[id].ts`, `src/pages/api/vendor/settings/profile.ts`, `src/pages/api/vendor/settings/addresses.ts`
  - Promotions: `src/server/sanity/promotions.ts`, `src/pages/api/promotions/*`, `src/lib/storefrontQueries.ts`
- Vendor portal services:
  - Invite/reset + tokens: `src/server/vendor-portal/service.ts`

## Integration Points (Cross-Repo)

- Stripe
  - Checkout + order creation: `src/pages/api/checkout.ts`, `src/pages/api/webhooks.ts`
  - Sanity-side Stripe syncing: `netlify/functions/stripeWebhook.ts`, `netlify/functions/syncStripeCatalog.ts`
  - Customer-level discounts: `netlify/functions/createCustomerDiscount.ts`
- EasyPost
  - Rate lookup + label creation: `src/pages/api/shipping/rates.ts`, `src/pages/api/shipping/create-label.ts`
  - Shipment webhook sync to Sanity: `netlify/functions/easypostWebhook.ts`
- Email
  - Resend usage: `src/pages/api/webhooks.ts`, `src/lib/emailService.ts`
- SMS
  - Twilio usage: `netlify/functions/notify-sms.ts`
