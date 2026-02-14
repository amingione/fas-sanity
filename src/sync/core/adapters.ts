// fas-sanity/src/sync/core/adapters.ts
import type {SanityClient} from '@sanity/client'
import type {Product as CanonicalProduct} from './types'

type MedusaProductsApi = {
  update?: (id: string, payload: Record<string, unknown>) => Promise<unknown>
  create?: (payload: Record<string, unknown>) => Promise<unknown>
}

export type MedusaLikeClient = {
  products?: MedusaProductsApi
}

const mapSanityStatus = (status: CanonicalProduct['status']): string =>
  status === 'active' ? 'active' : status === 'archived' ? 'archived' : 'draft'

const mapSanityAvailability = (product: CanonicalProduct): string => {
  const variant = product.variants[0]
  if (variant?.allow_backorder) return 'backorder'
  if ((variant?.inventory_quantity || 0) > 0) return 'in_stock'
  return 'out_of_stock'
}

const isServiceType = (product: CanonicalProduct): boolean => product.type === 'service'

const setIfDefined = (target: Record<string, unknown>, key: string, value: unknown) => {
  if (value !== undefined) {
    target[key] = value
  }
}

export async function patchSanityProduct(
  client: SanityClient,
  product: CanonicalProduct,
): Promise<void> {
  const productId = product.sanityId
  if (!productId) {
    throw new Error('Cannot patch Sanity product without canonical sanityId')
  }

  const primaryVariant = product.variants[0]
  const setOps: Record<string, unknown> = {
    title: product.title,
    slug: {_type: 'slug', current: product.slug},
    status: mapSanityStatus(product.status),
    productType: product.type,
    tags: product.tags,
    trackInventory: primaryVariant?.manage_inventory ?? true,
    manualInventoryCount: primaryVariant?.inventory_quantity ?? 0,
    availability: mapSanityAvailability(product),
    'shippingConfig.requiresShipping':
      primaryVariant?.requires_shipping ?? !isServiceType(product),
  }
  setIfDefined(setOps, 'medusaProductId', product.medusaId)
  setIfDefined(setOps, 'medusaVariantId', primaryVariant?.medusaId)
  setIfDefined(setOps, 'sku', primaryVariant?.sku)
  setIfDefined(setOps, 'price', primaryVariant ? primaryVariant.price_cents / 100 : undefined)

  await client.patch(productId).set(setOps).commit({autoGenerateArrayKeys: true})
}

const mapMedusaStatus = (status: CanonicalProduct['status']): string =>
  status === 'active' ? 'published' : status === 'archived' ? 'archived' : 'draft'

const productPayloadForMedusa = (product: CanonicalProduct): Record<string, unknown> => {
  const primaryVariant = product.variants[0]
  return {
    title: product.title,
    handle: product.slug,
    description: product.description,
    status: mapMedusaStatus(product.status),
    tags: product.tags.map((value) => ({value})),
    options: product.options.map((option) => ({
      title: option.name,
      values: option.values,
    })),
    variants: primaryVariant
      ? [
          {
            title: primaryVariant.title,
            sku: primaryVariant.sku,
            manage_inventory: primaryVariant.manage_inventory,
            allow_backorder: primaryVariant.allow_backorder,
            inventory_quantity: primaryVariant.inventory_quantity,
            requires_shipping: primaryVariant.requires_shipping,
            prices: [{currency_code: 'usd', amount: primaryVariant.price_cents}],
          },
        ]
      : [],
  }
}

export async function patchMedusaProduct(
  client: MedusaLikeClient,
  product: CanonicalProduct,
): Promise<void> {
  const payload = productPayloadForMedusa(product)
  const productsApi = client.products
  if (!productsApi) {
    throw new Error('Invalid Medusa client: missing products API')
  }

  if (product.medusaId) {
    if (!productsApi.update) {
      throw new Error('Invalid Medusa client: products.update is not available')
    }
    await productsApi.update(product.medusaId, payload)
    return
  }

  if (!productsApi.create) {
    throw new Error('Invalid Medusa client: products.create is not available')
  }
  await productsApi.create(payload)
}
