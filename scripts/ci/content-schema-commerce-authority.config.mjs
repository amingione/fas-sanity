export const contentSchemaFiles = [
  'packages/sanity-config/src/schemaTypes/documents/page.ts',
  'packages/sanity-config/src/schemaTypes/documents/collection.tsx',
  'packages/sanity-config/src/schemaTypes/documents/colorTheme.tsx',
  'packages/sanity-config/src/schemaTypes/documents/blog/blogPost.ts',
  'packages/sanity-config/src/schemaTypes/documents/blog/blogCategory.ts',
  'packages/sanity-config/src/schemaTypes/documents/downloadResource.ts',
  'packages/sanity-config/src/schemaTypes/documents/altText.ts',
  'packages/sanity-config/src/schemaTypes/singletons/homeType.ts',
  'packages/sanity-config/src/schemaTypes/singletons/siteSettingsType.ts',
]

export const forbiddenFieldNames = [
  'price',
  'compareAtPrice',
  'cost',
  'sku',
  'mpn',
  'medusaProductId',
  'medusaVariantId',
  'medusaOrderId',
  'medusaCartId',
  'inventory',
  'inventoryQuantity',
  'quantityOnHand',
  'quantityReserved',
  'trackInventory',
  'manageInventory',
  'allowBackorder',
  'lowStockThreshold',
  'shippingConfig',
  'shippingRate',
  'shippingRates',
  'cart',
  'cartItems',
  'checkoutSessionId',
  'checkoutStatus',
  'orderNumber',
  'orderStatus',
  'paymentStatus',
  'fulfillmentStatus',
  'totalAmount',
  'totalCents',
  'subtotalCents',
  'shippingCents',
  'taxCents',
  'discountCents',
  'currencyCode',
]

export const forbiddenTypeNames = [
  'priceRange',
  'inventoryType',
  'inventoryRecord',
  'inventoryTransaction',
  'checkoutSession',
  'abandonedCheckout',
  'order',
  'orderCartItem',
  'orderCartItemMeta',
  'shippingAddress',
  'shipmentWeight',
  'packageDimensions',
  'stripePriceSnapshot',
  'stripeOrderSummary',
]

// Keep this denylist explicit to avoid noisy pattern matching.
export const forbiddenDocumentTypeReferences = [
  'order',
  'invoice',
  'quote',
  'vendorOrder',
  'purchaseOrder',
]

// Scan only a short window after `type: "reference"` to keep false positives low.
export const referenceLookaheadLines = 12
