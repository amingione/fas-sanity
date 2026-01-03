import type {SanityClient} from '@sanity/client'
import type {CartItem} from './cartEnrichment'

const pruneUndefined = <T extends Record<string, any>>(input: T): T => {
  const output: Record<string, any> = {}
  for (const [key, value] of Object.entries(input)) {
    if (
      value === null ||
      value === undefined ||
      (typeof value === 'string' && !value.trim()) ||
      (Array.isArray(value) && value.length === 0)
    ) {
      continue
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      const nested = pruneUndefined(value as Record<string, any>)
      if (Object.keys(nested).length > 0) {
        output[key] = nested
      }
      continue
    }
    output[key] = value
  }
  return output as T
}

export type SimplifiedAbandonedCartItem = {
  _key: string
  productId?: string
  productName?: string
  quantity?: number
  price?: number
  imageUrl?: string
  slug?: string
}

export function simplifyCartForAbandonedCheckout(
  cart: CartItem[],
): SimplifiedAbandonedCartItem[] {
  return cart
    .map((item, index) => {
      const fallbackName =
        item.name || item.productName || item.sku || item.id || item.productSlug || 'Cart item'
      return pruneUndefined({
        _key: (item as any)?._key || `${item.id || item.sku || 'cart'}-${index}`,
        productId: item.id || item.sku || item.stripeProductId,
        productName: fallbackName,
        quantity: typeof item.quantity === 'number' ? item.quantity : undefined,
        price:
          typeof item.price === 'number'
            ? item.price
            : typeof item.total === 'number'
              ? item.total
              : undefined,
        imageUrl: typeof (item as any)?.image === 'string' ? (item as any).image : undefined,
        slug: item.productSlug || undefined,
      })
    })
    .filter((entry) => Object.keys(entry).length > 1)
}

export function buildAbandonedCartSummary(cart: SimplifiedAbandonedCartItem[]): string {
  if (!Array.isArray(cart) || cart.length === 0) return ''
  return cart
    .map((item) => {
      const qty =
        typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0
          ? item.quantity
          : 1
      const name = item.productName || item.productId || 'Item'
      return `${qty}× ${name}`
    })
    .join(', ')
}

export async function upsertAbandonedCheckoutDocument(
  client: SanityClient,
  doc: Record<string, any>,
): Promise<string | null> {
  if (!client) return null
  const checkoutId = doc.checkoutId || `ABANDONED-${Date.now()}`
  const payload = pruneUndefined({...doc})
  delete payload.checkoutId

  const existing = await client.fetch<{_id: string} | null>(
    `*[_type == "abandonedCheckout" && stripeSessionId == $sid][0]{_id}`,
    {sid: payload.stripeSessionId},
  )

  if (existing?._id) {
    try {
      await client
        .patch(existing._id)
        .set(payload)
        .setIfMissing({checkoutId})
        .commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('abandonedCheckout: failed to update document', err)
    }
    return existing._id
  }

  try {
    const created = await client.create(
      {
        _type: 'abandonedCheckout',
        checkoutId,
        ...payload,
      },
      {autoGenerateArrayKeys: true},
    )
    return created?._id || null
  } catch (err) {
    console.warn('abandonedCheckout: failed to create document', err)
    return null
  }
}

export async function markAbandonedCheckoutRecovered(
  client: SanityClient,
  stripeSessionId?: string,
  _orderId?: string | null,
): Promise<void> {
  if (!client || !stripeSessionId) return
  const doc = await client.fetch<{_id: string} | null>(
    `*[_type == "abandonedCheckout" && stripeSessionId == $sid][0]{_id}`,
    {sid: stripeSessionId},
  )
  if (!doc?._id) return
  const patch: Record<string, any> = {
    status: 'recovered',
  }
  try {
    await client.patch(doc._id).set(patch).commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('abandonedCheckout: failed to mark recovered', err)
  }
}
