import type {SanityClient} from '@sanity/client'

const BRAND_PREFIX = 'FAS'
const FALLBACK_PREFIX = 'UNI'
const DEFAULT_REVISION = 'A'
const DEFAULT_STARTING_NUMBER = 636
const SETTINGS_TYPE = 'siteSettings'
const NEXT_SERIAL_FIELD = 'nextMpnNumber'

type ProductForCodes = {
  _id: string
  _rev?: string
  sku?: string
  mpn?: string
  categoryPrefix?: string | null
}

type SettingsDoc = {
  _id: string
  nextMpnNumber?: number
}

export type ProductCodeResult = {
  generated: boolean
  sku?: string
  mpn?: string
  prefix?: string
  serial?: string
  skippedReason?: string
}

export async function ensureProductCodes(
  productId: string,
  client: SanityClient,
  options?: {log?: (...args: unknown[]) => void},
): Promise<ProductCodeResult> {
  const log = options?.log || ((...args: unknown[]) => console.log('[product-codes]', ...args))

  const product = await client.fetch<ProductForCodes>(
    `*[_id == $productId][0]{_id, _rev, sku, mpn, "categoryPrefix": category[0]->mpnPrefix}`,
    {productId},
  )

  if (!product) {
    log(`No product found for id ${productId}; skipping code generation.`)
    return {generated: false, skippedReason: 'missing product'}
  }

  const hasSku = typeof product.sku === 'string' && product.sku.trim() !== ''
  const hasMpn = typeof product.mpn === 'string' && product.mpn.trim() !== ''

  if (hasSku || hasMpn) {
    log(`SKU/MPN already exist for ${product._id}; skipping generation.`)
    return {generated: false, skippedReason: 'existing codes'}
  }

  let settings = await client.fetch<SettingsDoc>(
    `*[_type == $type][0]{_id, ${NEXT_SERIAL_FIELD}}`,
    {type: SETTINGS_TYPE},
  )

  const nextNumber =
    typeof settings?.nextMpnNumber === 'number' ? settings.nextMpnNumber : DEFAULT_STARTING_NUMBER
  const settingsId = settings?._id || SETTINGS_TYPE

  if (!settings?._id) {
    await client.createIfNotExists({
      _id: settingsId,
      _type: SETTINGS_TYPE,
      nextMpnNumber: nextNumber,
      title: 'Site Settings',
    })
    log(`Created ${SETTINGS_TYPE} document (${settingsId}) with starting number ${nextNumber}.`)
    settings = {_id: settingsId, nextMpnNumber: nextNumber}
  }

  const prefix = (product.categoryPrefix || FALLBACK_PREFIX).toUpperCase()
  const serial = String(nextNumber).padStart(4, '0')
  const sku = `${prefix}-${serial}${DEFAULT_REVISION}`
  const mpn = `${BRAND_PREFIX}-${prefix}-${serial}${DEFAULT_REVISION}`

  const productPatch = client.patch(product._id).set({sku, mpn})
  if (product._rev) {
    productPatch.ifRevisionId(product._rev)
  }

  await client
    .transaction()
    .patch(productPatch)
    .patch(settings._id, (patch) => patch.set({[NEXT_SERIAL_FIELD]: nextNumber + 1}))
    .commit({autoGenerateArrayKeys: true})

  log(
    `Generated SKU ${sku} and MPN ${mpn} for ${product._id} (prefix=${prefix}, serial=${serial}, rev=${DEFAULT_REVISION}).`,
  )

  if (!product.categoryPrefix) {
    log(`No category prefix found for ${product._id}; used fallback ${FALLBACK_PREFIX}.`)
  }

  return {generated: true, sku, mpn, prefix, serial}
}
