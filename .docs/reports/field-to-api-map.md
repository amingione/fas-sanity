## 🔒 Schema ↔ API Mapping Contract

This document defines the canonical mapping between:
- Sanity schemas
- Runtime payloads (Stripe, EasyPost, internal APIs)
- Backfill input/output shapes

### Contract Level
- Status: AUTHORITATIVE
- Enforcement: Progressive (docs → lint → runtime)
- Scope: Field names, nesting, and data ownership
- Exceptions: Must be explicitly documented and approved
- Read-only: This file is a locked reference unless explicit authorization is granted
- Canonical reference: Runtime code must align to this document, not vice versa
- Change control: Updates require explicit authorization

### What this file does NOT do (by design)
- ❌ It does not normalize schemas
- ❌ It does not resolve drift
- ❌ It does not enforce runtime mapping automatically

These actions are handled by downstream enforcement layers.

# Field-to-API Map (String Fields)

- Source: `packages/sanity-config/schema.json` (parsed schema output)
- Scope: fields with `type: "string"` (direct string fields; array-of-string fields are excluded)
- Paths use dot notation for nested objects

## Inconsistencies and drift risks
- Address schemas diverge on field naming: `order.shippingAddress`/`order.billingAddress` use camelCase (`addressLine1`, `postalCode`) in `packages/sanity-config/src/schemaTypes/documents/order.tsx`, while `shipTo`/`shipToAddress`/`shippingOptionCustomerAddress` use snake_case (`address_line1`, `postal_code`) in `packages/sanity-config/src/schemaTypes/objects/shipToType.ts`, `packages/sanity-config/src/schemaTypes/objects/shipToSnakeType.ts`, and `packages/sanity-config/src/schemaTypes/objects/shippingOptionCustomerAddressType.ts`. `customerBillingAddress` and `customerAddress` use `street`/`postalCode` or `zip` in `packages/sanity-config/src/schemaTypes/objects/customerBillingAddressType.ts` and `packages/sanity-config/src/schemaTypes/objects/customerAddressType.ts`. This split increases the chance of using the wrong schema and rendering blank address fields.
- `shipTo` includes `email`, but `shipToAddress` does not; mixing these schemas can drop emails from fulfillment views. See `packages/sanity-config/src/schemaTypes/objects/shipToType.ts` and `packages/sanity-config/src/schemaTypes/objects/shipToSnakeType.ts`.
- `orderCartItem` lacks a `productName` field in `packages/sanity-config/src/schemaTypes/objects/orderCartItemType.ts`, yet `productName` is referenced across runtime types and render logic (`packages/sanity-config/src/types/order.ts`, `netlify/functions/stripeWebhook.ts`, `netlify/lib/invoicePdf.ts`). This mismatch can lead to missing product names or fallback labels in UI and PDFs.
- `order.cart` is the schema field in `packages/sanity-config/src/schemaTypes/documents/order.tsx`, but webhook parsing accepts `cartItems`/`cart_items` in `src/pages/api/webhooks/stripe-order.ts` and `netlify/functions/stripeWebhook.ts`. This mismatch can route data into the wrong field or skip expected cart hydration if the mapper uses the wrong key.
- `order.shippingAddress` and `order.billingAddress` are inline object definitions instead of reusing `shippingAddressType`/`customerBillingAddressType`, so edits to shared address schemas will not propagate to order fields without manual alignment, increasing drift risk.

### Cart Key Normalization — RESOLVED

Status: RESOLVED  
Date: 2026-01-04  
Normalization boundary: `normalizeStripeOrderToSanityOrder`  
Applies to: Stripe webhook order ingestion

Resolved aliases:
- cartItems
- cart_items
- lineItems
- line_items

Canonical field:
- order.cart

Resolution is enforced at the Stripe webhook boundary only.
No backfills or schema renames were performed.

This closes the loop required by Part C.
No code changes needed — documentation only.

One thing I checked closely (and you got right):
Your normalizeCartItem function:
- assigns canonical fields only if missing
- removes aliases afterward
- does not overwrite existing normalized data

That prevents:
- clobbering historical orders
- changing already-clean payloads
- subtle regressions in replays

Run Tests:
- cartItems -> order.cart
- lineItems -> order.cart
- order.cart remains unchanged
- mixed keys -> order.cart wins

No address tests. No customer tests.

Final status:
- Part C implementation: ACCEPTED
- Normalization boundary: LIVE
- Runtime enforcement: SOFT, correct
- Scope control: MAINTAINED

## `packages/sanity-config/src/schemaTypes/documents/attribution.ts`
### `attribution`
- `externalId`
- `syncDate`
- `dateRange.start`
- `dateRange.end`
- `campaign`
- `adGroup`
- `medium`
- `term`
- `content`
- `landingPage`
- `sessionId`
- `notes`

## `packages/sanity-config/src/schemaTypes/documents/bankAccount.ts`
### `bankAccount`
- `title`
- `institutionName`
- `holderName`
- `stripeAccountId`
- `accountLast4`
- `routingLast4`
- `metadata.lastSyncedAt`
- `metadata.linkSessionId`

## `packages/sanity-config/src/schemaTypes/documents/bill.tsx`
### `bill`
- `description`
- `dueDate`
- `paidDate`
- `checkNumber`
- `printCheck`

## `packages/sanity-config/src/schemaTypes/documents/category.ts`
### `category`
- `title`

## `packages/sanity-config/src/schemaTypes/documents/check.ts`
### `check`
- `payee`
- `mailingAddress`
- `memo`
- `paymentDate`

## `packages/sanity-config/src/schemaTypes/documents/collection.tsx`
### `collection`
- `hidden`

## `packages/sanity-config/src/schemaTypes/documents/colorTheme.tsx`
### `colorTheme`
- `title`
- `text`
- `background`

## `packages/sanity-config/src/schemaTypes/documents/customer.ts`
### `customer`
- `userId`
- `name`
- `firstName`
- `lastName`
- `email`
- `stripeCustomerId`
- `stripeLastSyncedAt`
- `passwordHash`
- `phone`
- `address`
- `updatedAt`

## `packages/sanity-config/src/schemaTypes/documents/downloadResource.ts`
### `downloadResource`
- `title`
- `description`
- `publishedAt`

## `packages/sanity-config/src/schemaTypes/documents/expense.ts`
### `expense`
- `date`
- `category`
- `notes`

## `packages/sanity-config/src/schemaTypes/documents/expiredCart.tsx`
### `expiredCart`
- `stripeSessionId`
- `clientReferenceId`
- `paymentStatus`
- `customerEmail`
- `customerName`
- `stripeCustomerId`
- `stripeRaw`
- `stripeEventId`
- `eventCreated`
- `failureMessage`
- `currency`
- `note`
- `createdAt`
- `expiredAt`
- `recoveredAt`

## `packages/sanity-config/src/schemaTypes/documents/filterTag.ts`
### `filterTag`
- `title`
- `description`

## `packages/sanity-config/src/schemaTypes/documents/freightQuote.ts`
### `freightQuote`
- `title`
- `createdAt`
- `contactName`
- `contactEmail`
- `contactPhone`
- `notes`

## `packages/sanity-config/src/schemaTypes/documents/invoiceContent.tsx`
### `invoice`
- `title`
- `invoiceHeader`
- `invoiceNumber`
- `orderNumber`
- `shippingCarrier`
- `trackingNumber`
- `trackingUrl`
- `shippingLabelUrl`
- `selectedService.carrierId`
- `selectedService.carrier`
- `selectedService.service`
- `selectedService.serviceCode`
- `selectedService.currency`
- `selectedService.estimatedDeliveryDate`
- `customerNotes`
- `internalNotes`
- `invoiceDate`
- `dueDate`
- `paymentTerms`
- `serviceRenderedBy`
- `paymentInstructions`
- `paymentLinkUrl`
- `currency`
- `stripeSessionId`
- `paymentIntentId`
- `receiptUrl`
- `customerEmail`
- `stripeInvoiceId`
- `stripeInvoiceStatus`
- `paymentFailureCode`
- `paymentFailureMessage`
- `stripeHostedInvoiceUrl`
- `stripeInvoicePdf`
- `stripeLastSyncedAt`
- `userId`
- `dateIssued`
- `totalsPanel`
- `actions`

## `packages/sanity-config/src/schemaTypes/documents/paymentLink.ts`
### `paymentLink`
- `title`
- `stripePaymentLinkId`
- `status`
- `url`
- `afterCompletion`
- `stripeLastSyncedAt`

## `packages/sanity-config/src/schemaTypes/documents/product.ts`
### `product`
- `title`
- `sku`
- `stripeProductId`
- `stripeDefaultPriceId`
- `stripePriceId`
- `stripeUpdatedAt`
- `stripeLastSyncedAt`
- `shortDescription[].children[].text`
- `shortDescription[].markDefs[].href`
- `importantNotes[].children[].text`
- `importantNotes[].markDefs[].href`
- `images[].alt`
- `metaTitle`
- `metaDescription`
- `brand`
- `gtin`
- `mpn`
- `socialImage.alt`
- `canonicalUrl`
- `boxDimensions`
- `color`
- `size`
- `material`

## `packages/sanity-config/src/schemaTypes/documents/productBundle.ts`
### `productBundle`
- `title`
- `description[].children[].text`
- `description[].markDefs[].href`

## `packages/sanity-config/src/schemaTypes/documents/productVariant.tsx`
### `productVariant`
- `hidden`

## `packages/sanity-config/src/schemaTypes/documents/quoteContent.tsx`
### `quote`
- `quoteNumber`
- `title`
- `quoteDate`
- `expirationDate`
- `acceptedDate`
- `acceptedBy`
- `quoteTotals`
- `customerMessage`
- `paymentInstructions`
- `internalMemo`
- `quoteActions`
- `stripeSummary`
- `status`
- `conversionStatus`
- `createdAt`
- `quotePdfUrl`
- `lastEmailedAt`
- `convertToInvoice`
- `stripeQuoteId`
- `stripeQuoteNumber`
- `stripeQuoteStatus`
- `stripeCustomerId`
- `stripePaymentLinkId`
- `stripePaymentLinkUrl`
- `stripeLastSyncedAt`
- `stripeQuotePdf`

## `packages/sanity-config/src/schemaTypes/documents/shippingLabel.tsx`
### `shippingLabel`
- `name`
- `serviceSelection`
- `actions`
- `trackingNumber`
- `labelUrl`

## `packages/sanity-config/src/schemaTypes/documents/shippingOption.ts`
### `shippingOption`
- `easyPostService`

## `packages/sanity-config/src/schemaTypes/documents/stripeWebhook.ts`
### `stripeWebhook`
- `summary`
- `eventType`
- `occurredAt`
- `processedAt`
- `stripeEventId`
- `requestId`
- `resourceType`
- `resourceId`
- `invoiceNumber`
- `invoiceStatus`
- `paymentIntentId`
- `chargeId`
- `customerId`
- `orderNumber`
- `invoiceId`
- `metadata`
- `rawPayload`

## `packages/sanity-config/src/schemaTypes/documents/stripeWebhookEvent.ts`
### `stripeWebhookEvent`
- `eventId`
- `eventType`
- `summary`
- `status`
- `currency`
- `resourceId`
- `resourceType`
- `requestId`
- `apiVersion`
- `metadata`
- `data`
- `payload`
- `createdAt`
- `receivedAt`

## `packages/sanity-config/src/schemaTypes/documents/tune.ts`
### `tune`
- `title`

## `packages/sanity-config/src/schemaTypes/documents/vehicleModel.ts`
### `vehicleModel`
- `title`
- `make`
- `model`

## `packages/sanity-config/src/schemaTypes/documents/vendor.ts`
### `vendor`
- `name`
- `email`
- `passwordHash`
- `phone`
- `address`
- `notes`
- `companyName`
- `website`
- `appliedAt`
- `contactPerson`
- `resaleCertificateId`
- `taxId`
- `businessAddress`
- `lastLogin`

## `packages/sanity-config/src/schemaTypes/documents/wheelQuote.ts`
### `wheelQuote`
- `source`
- `pageContext`
- `createdAt`
- `fullname`
- `email`
- `phone`
- `vehicleYear`
- `vehicleMake`
- `vehicleModel`
- `backspacing`
- `tireSizeFront`
- `tireSizeRear`
- `brakeClearanceNotes`
- `notes`

## `packages/sanity-config/src/schemaTypes/marketing/campaigns/campaign.ts`
### `campaign`
- `title`
- `startDate`
- `endDate`
- `channels[].channelName`
- `channels[].utm.source`
- `channels[].utm.medium`
- `channels[].utm.campaign`
- `channels[].utm.term`
- `channels[].utm.content`
- `deviceAnalytics[].deviceType`
- `locationAnalytics[].location`
- `description`
- `webhookConfig.endpoint`
- `webhookConfig.secret`
- `webhookConfig.customHeaders[].key`
- `webhookConfig.customHeaders[].value`

## `packages/sanity-config/src/schemaTypes/marketing/marketingChannel.ts`
### `marketingChannel`
- `apiKey`
- `accountId`
- `endpoint`

## `packages/sanity-config/src/schemaTypes/singletons/dashboardViewType.ts`
### `dashboardView`
- `label`

## Unmapped schema types (no file match found)
### `booking`
- `bookingId`
- `service`
- `scheduledAt`
- `notes`
- `createdAt`

### `order`
- `orderNumber`
- `paymentStatus`
- `createdAt`
- `stripeLastSyncedAt`
- `customerName`
- `customerEmail`
- `userId`
- `currency`
- `paymentIntentId`
- `stripePaymentIntentStatus`
- `chargeId`
- `cardBrand`
- `cardLast4`
- `receiptUrl`
- `lastRefundId`
- `lastRefundStatus`
- `lastRefundReason`
- `lastRefundedAt`
- `lastDisputeId`
- `lastDisputeStatus`
- `lastDisputeReason`
- `lastDisputeCurrency`
- `lastDisputeCreatedAt`
- `lastDisputeDueBy`
- `paymentFailureCode`
- `paymentFailureMessage`
- `stripeSessionId`
- `stripeSource`
- `stripeCheckoutStatus`
- `stripeSessionStatus`
- `stripeCheckoutMode`
- `stripeCreatedAt`
- `stripeExpiresAt`
- `selectedService.carrierId`
- `selectedService.carrier`
- `selectedService.service`
- `selectedService.serviceCode`
- `selectedService.currency`
- `selectedService.estimatedDeliveryDate`
- `selectedShippingCurrency`
- `shippingEstimatedDeliveryDate`
- `shippingServiceCode`
- `shippingServiceName`
- `shippingMetadata.shipping_amount`
- `shippingMetadata.shipping_carrier`
- `shippingMetadata.shipping_carrier_id`
- `shippingMetadata.shipping_currency`
- `shippingMetadata.shipping_delivery_days`
- `shippingMetadata.shipping_estimated_delivery_date`
- `shippingMetadata.shipping_service`
- `shippingMetadata.shipping_service_code`
- `shippingMetadata.shipping_service_name`
- `shippingMetadata.amount`
- `shippingMetadata.carrier`
- `shippingMetadata.carrier_id`
- `shippingMetadata.currency`
- `shippingMetadata.service`
- `shippingMetadata.service_code`
- `shippingMetadata.shipping_rate_id`
- `shippingMetadata.source`
- `shippingLabelUrl`
- `trackingNumber`
- `trackingUrl`
- `packingSlipUrl`
- `fulfilledAt`
- `shippingActions`

### `page`
- `title`

### `sanity.fileAsset`
- `originalFilename`
- `label`
- `title`
- `description`
- `altText`
- `sha1hash`
- `extension`
- `mimeType`
- `assetId`
- `uploadId`
- `path`
- `url`

### `sanity.imageAsset`
- `originalFilename`
- `label`
- `title`
- `description`
- `altText`
- `sha1hash`
- `extension`
- `mimeType`
- `assetId`
- `uploadId`
- `path`
- `url`

### `siteSettings`
- `title`
- `description`

## Array of Strings
### `customer` (packages/sanity-config/src/schemaTypes/documents/customer.ts)
- `roles[]`
- `stripeCustomerIds[]`

### `downloadResource` (packages/sanity-config/src/schemaTypes/documents/downloadResource.ts)
- `tags[]`

### `product` (packages/sanity-config/src/schemaTypes/documents/product.ts)
- `importantNotes[].children[].marks[]`
- `shortDescription[].children[].marks[]`
- `variationOptions[]`

### `productBundle` (packages/sanity-config/src/schemaTypes/documents/productBundle.ts)
- `description[].children[].marks[]`

### `vendor` (packages/sanity-config/src/schemaTypes/documents/vendor.ts)
- `roles[]`

## Array of Objects (Shallow)
### `campaign` (packages/sanity-config/src/schemaTypes/marketing/campaigns/campaign.ts)
- `channels[]`
- `deviceAnalytics[]`
- `locationAnalytics[]`
- `products[]`
- `webhookConfig.customHeaders[]`

### `category` (packages/sanity-config/src/schemaTypes/documents/category.ts)
- `products[]`

### `check` (packages/sanity-config/src/schemaTypes/documents/check.ts)
- `attachments[]`
- `lineItems[]`

### `customer` (packages/sanity-config/src/schemaTypes/documents/customer.ts)
- `addresses[]`
- `discounts[]`
- `orders[]`
- `quotes[]`
- `stripeMetadata[]`
- `wishlistItems[]`

### `expiredCart` (packages/sanity-config/src/schemaTypes/documents/expiredCart.tsx)
- `cart[]`
- `events[]`
- `metadata[]`

### `freightQuote` (packages/sanity-config/src/schemaTypes/documents/freightQuote.ts)
- `cart[]`
- `packages[]`

### `invoice` (packages/sanity-config/src/schemaTypes/documents/invoiceContent.tsx)
- `lineItems[]`
- `shippingLog[]`

### `order`
- `cart[]`
- `lineItems[]`
- `orderEvents[]`
- `shippingLog[]`

### `paymentLink` (packages/sanity-config/src/schemaTypes/documents/paymentLink.ts)
- `lineItems[]`
- `metadata[]`

### `product` (packages/sanity-config/src/schemaTypes/documents/product.ts)
- `addOns[]`
- `attributes[]`
- `category[]`
- `compatibleVehicles[]`
- `filters[]`
- `images[]`
- `importantNotes[]`
- `importantNotes[].children[]`
- `importantNotes[].markDefs[]`
- `includedInKit[]`
- `mediaAssets[]`
- `pricingTiers[]`
- `relatedProducts[]`
- `shortDescription[]`
- `shortDescription[].children[]`
- `shortDescription[].markDefs[]`
- `specifications[]`
- `stripeMetadata[]`
- `stripePrices[]`
- `upsellProducts[]`

### `productBundle` (packages/sanity-config/src/schemaTypes/documents/productBundle.ts)
- `description[]`
- `description[].children[]`
- `description[].markDefs[]`
- `products[]`

### `quote` (packages/sanity-config/src/schemaTypes/documents/quoteContent.tsx)
- `attachments[]`
- `lineItems[]`
- `timeline[]`

### `vendor` (packages/sanity-config/src/schemaTypes/documents/vendor.ts)
- `assignedCustomers[]`
- `orders[]`
- `quotes[]`

## Numeric Fields
### `attribution` (packages/sanity-config/src/schemaTypes/documents/attribution.ts)
- `conversionValue`
- `metrics.clickThroughs`
- `metrics.clicks`
- `metrics.commissions`
- `metrics.impressions`
- `metrics.newCustomers`
- `metrics.opens`
- `metrics.orders`
- `metrics.returningCustomers`
- `metrics.revenue`
- `metrics.sessions`
- `metrics.spend`

### `bill` (packages/sanity-config/src/schemaTypes/documents/bill.tsx)
- `amount`

### `campaign` (packages/sanity-config/src/schemaTypes/marketing/campaigns/campaign.ts)
- `channels[].orders`
- `channels[].sales`
- `channels[].sessions`
- `deviceAnalytics[].orders`
- `deviceAnalytics[].sales`
- `deviceAnalytics[].sessions`
- `locationAnalytics[].orders`
- `locationAnalytics[].sales`
- `locationAnalytics[].sessions`
- `metrics.avgOrderValue`
- `metrics.orders`
- `metrics.sales`
- `metrics.sessions`
- `orders.newOrders`
- `orders.returningOrders`
- `products[].sales`
- `products[].unitsSold`

### `check` (packages/sanity-config/src/schemaTypes/documents/check.ts)
- `amount`
- `checkNumber`

### `customer` (packages/sanity-config/src/schemaTypes/documents/customer.ts)
- `lifetimeSpend`
- `orderCount`
- `quoteCount`

### `expense` (packages/sanity-config/src/schemaTypes/documents/expense.ts)
- `amount`

### `expiredCart` (packages/sanity-config/src/schemaTypes/documents/expiredCart.tsx)
- `totalAmount`

### `invoice` (packages/sanity-config/src/schemaTypes/documents/invoiceContent.tsx)
- `amountShipping`
- `amountSubtotal`
- `amountTax`
- `depositAmount`
- `discountValue`
- `selectedService.amount`
- `selectedService.deliveryDays`
- `subtotal`
- `taxRate`
- `total`

### `order`
- `amountRefunded`
- `amountShipping`
- `amountSubtotal`
- `amountTax`
- `lastDisputeAmount`
- `selectedService.amount`
- `selectedService.deliveryDays`
- `selectedShippingAmount`
- `shippingDeliveryDays`
- `totalAmount`

### `product` (packages/sanity-config/src/schemaTypes/documents/product.ts)
- `averageHorsepower`
- `importantNotes[].level`
- `manualInventoryCount`
- `price`
- `salePrice`
- `shippingWeight`
- `shortDescription[].level`

### `productBundle` (packages/sanity-config/src/schemaTypes/documents/productBundle.ts)
- `bundlePrice`
- `description[].level`

### `quote` (packages/sanity-config/src/schemaTypes/documents/quoteContent.tsx)
- `discountValue`
- `subtotal`
- `taxAmount`
- `taxRate`
- `total`

### `sanity.fileAsset`
- `size`

### `sanity.imageAsset`
- `size`

### `shippingOption` (packages/sanity-config/src/schemaTypes/documents/shippingOption.ts)
- `shippingCost`

### `stripeWebhookEvent` (packages/sanity-config/src/schemaTypes/documents/stripeWebhookEvent.ts)
- `amount`

### `vendor` (packages/sanity-config/src/schemaTypes/documents/vendor.ts)
- `yearsInBusiness`

### `wheelQuote` (packages/sanity-config/src/schemaTypes/documents/wheelQuote.ts)
- `diameter`
- `qtyFront`
- `qtyRear`
- `width`

## Boolean Flags
### `bankAccount` (packages/sanity-config/src/schemaTypes/documents/bankAccount.ts)
- `defaultForChecks`

### `bill` (packages/sanity-config/src/schemaTypes/documents/bill.tsx)
- `paid`

### `campaign` (packages/sanity-config/src/schemaTypes/marketing/campaigns/campaign.ts)
- `webhookConfig.enabled`

### `collection` (packages/sanity-config/src/schemaTypes/documents/collection.tsx)
- `showHero`

### `customer` (packages/sanity-config/src/schemaTypes/documents/customer.ts)
- `emailOptIn`
- `marketingOptIn`
- `textOptIn`

### `marketingChannel` (packages/sanity-config/src/schemaTypes/marketing/marketingChannel.ts)
- `active`

### `order`
- `checkoutDraft`
- `confirmationEmailSent`
- `webhookNotified`

### `page`
- `showHero`

### `paymentLink` (packages/sanity-config/src/schemaTypes/documents/paymentLink.ts)
- `active`
- `livemode`

### `product` (packages/sanity-config/src/schemaTypes/documents/product.ts)
- `featured`
- `installOnly`
- `noindex`
- `onSale`
- `shipsAlone`
- `stripeActive`

### `stripeWebhook` (packages/sanity-config/src/schemaTypes/documents/stripeWebhook.ts)
- `livemode`

### `stripeWebhookEvent` (packages/sanity-config/src/schemaTypes/documents/stripeWebhookEvent.ts)
- `livemode`

### `vendor` (packages/sanity-config/src/schemaTypes/documents/vendor.ts)
- `active`
- `approved`

### `wheelQuote` (packages/sanity-config/src/schemaTypes/documents/wheelQuote.ts)
- `agreeTrackUseOnly`

## Date / Time Fields
### `bankAccount` (packages/sanity-config/src/schemaTypes/documents/bankAccount.ts)
- `metadata.lastSyncedAt`

### `bill` (packages/sanity-config/src/schemaTypes/documents/bill.tsx)
- `paidDate`

### `campaign` (packages/sanity-config/src/schemaTypes/marketing/campaigns/campaign.ts)
- `endDate`
- `startDate`

### `customer` (packages/sanity-config/src/schemaTypes/documents/customer.ts)
- `stripeLastSyncedAt`
- `updatedAt`

### `downloadResource` (packages/sanity-config/src/schemaTypes/documents/downloadResource.ts)
- `publishedAt`

### `expiredCart` (packages/sanity-config/src/schemaTypes/documents/expiredCart.tsx)
- `createdAt`
- `eventCreated`
- `expiredAt`
- `recoveredAt`

### `freightQuote` (packages/sanity-config/src/schemaTypes/documents/freightQuote.ts)
- `createdAt`

### `invoice` (packages/sanity-config/src/schemaTypes/documents/invoiceContent.tsx)
- `stripeLastSyncedAt`

### `paymentLink` (packages/sanity-config/src/schemaTypes/documents/paymentLink.ts)
- `stripeLastSyncedAt`

### `product` (packages/sanity-config/src/schemaTypes/documents/product.ts)
- `stripeLastSyncedAt`
- `stripeUpdatedAt`

### `quote` (packages/sanity-config/src/schemaTypes/documents/quoteContent.tsx)
- `createdAt`
- `lastEmailedAt`
- `stripeLastSyncedAt`

### `stripeWebhook` (packages/sanity-config/src/schemaTypes/documents/stripeWebhook.ts)
- `occurredAt`
- `processedAt`

### `stripeWebhookEvent` (packages/sanity-config/src/schemaTypes/documents/stripeWebhookEvent.ts)
- `createdAt`
- `receivedAt`

### `vendor` (packages/sanity-config/src/schemaTypes/documents/vendor.ts)
- `lastLogin`

### `wheelQuote` (packages/sanity-config/src/schemaTypes/documents/wheelQuote.ts)
- `createdAt`
