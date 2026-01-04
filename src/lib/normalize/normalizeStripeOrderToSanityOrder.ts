export function normalizeStripeOrderToSanityOrder(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input

  const source = input as Record<string, unknown>
  const normalized: Record<string, unknown> = {...source}

  const cartCandidate = Array.isArray(source.cart)
    ? source.cart
    : Array.isArray(source.cartItems)
      ? source.cartItems
      : Array.isArray(source.cart_items)
        ? source.cart_items
        : Array.isArray(source.lineItems)
          ? source.lineItems
          : Array.isArray(source.line_items)
            ? source.line_items
            : undefined

  if (cartCandidate) {
    normalized.cart = cartCandidate.map((item) => normalizeCartItem(item))
    delete normalized.cartItems
    delete normalized.cart_items
    delete normalized.lineItems
    delete normalized.line_items
  }

  return normalized
}

const normalizeCartItem = (input: unknown): unknown => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input

  const source = input as Record<string, unknown>
  const normalized: Record<string, unknown> = {...source}

  const resolveValue = (keys: string[]): unknown => {
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null) return source[key]
    }
    return undefined
  }

  const assignIfMissing = (key: string, value: unknown) => {
    if ((normalized as any)[key] === undefined || (normalized as any)[key] === null) {
      if (value !== undefined && value !== null) {
        ;(normalized as any)[key] = value
      }
    }
  }

  const resolvedProductName = resolveValue([
    'productName',
    'product_name',
    'stripe_product_name',
    'name',
    'title',
  ])

  assignIfMissing('id', resolveValue(['id', 'productId', 'product_id', 'sanity_product_id']))
  assignIfMissing('productName', resolvedProductName)
  assignIfMissing('name', resolvedProductName)
  assignIfMissing('image', resolveValue(['image', 'imageUrl', 'image_url', 'imageURL']))
  assignIfMissing('productSlug', resolveValue(['productSlug', 'product_slug', 'slug', 'handle']))
  assignIfMissing('productUrl', resolveValue(['productUrl', 'product_url', 'url']))
  assignIfMissing('lineTotal', resolveValue(['lineTotal', 'line_total']))
  assignIfMissing('total', resolveValue(['total', 'line_total']))
  assignIfMissing('price', resolveValue(['price', 'unit_price', 'unitPrice']))
  assignIfMissing('quantity', resolveValue(['quantity', 'qty', 'q']))

  const aliasKeys = [
    'productId',
    'product_id',
    'sanity_product_id',
    'product_name',
    'stripe_product_name',
    'title',
    'imageUrl',
    'image_url',
    'imageURL',
    'product_slug',
    'slug',
    'handle',
    'product_url',
    'url',
    'line_total',
    'unit_price',
    'unitPrice',
    'qty',
    'q',
  ]
  for (const key of aliasKeys) {
    delete normalized[key]
  }

  return normalized
}
