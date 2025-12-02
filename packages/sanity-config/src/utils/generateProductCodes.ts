import type {SanityClient} from '@sanity/client'

const BRAND_PREFIX = 'FAS'
const FALLBACK_PREFIX = 'UNI'
const DEFAULT_REVISION = 'A'
const DEFAULT_STARTING_NUMBER = 636
const SETTINGS_TYPE = 'siteSettings'
const SETTINGS_TITLE = 'Site Settings'
const NEXT_SERIAL_FIELD = 'nextMpnNumber'
const SERIAL_PAD_LENGTH = 3

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

type SerialInfo = {
  prefix: string
  serialNumber: number
  serial: string
}

type GenerateMpnOptions = {
  categoryPrefix?: string | null
}

export type ProductCodeResult = {
  generated: boolean
  sku?: string
  mpn?: string
  prefix?: string
  serial?: string
  skippedReason?: string
}

const MPN_REGEX = /^(?:([A-Z0-9]+)-)?([A-Z0-9]+)-(\d+)([A-Z])?$/

function normalizePrefix(prefix?: string | null): string {
  const trimmed = typeof prefix === 'string' ? prefix.trim() : ''
  return trimmed ? trimmed.toUpperCase() : FALLBACK_PREFIX
}

function formatSerial(serialNumber: number): string {
  const safe = Number.isFinite(serialNumber) ? serialNumber : DEFAULT_STARTING_NUMBER
  return String(safe).padStart(SERIAL_PAD_LENGTH, '0')
}

function buildMpn(prefix: string, serial: string): string {
  return `${prefix}-${serial}`
}

function buildSku(prefix: string, serial: string): string {
  return `${BRAND_PREFIX}-${prefix}-${serial}${DEFAULT_REVISION}`
}

function parseMpn(mpn?: string | null): SerialInfo | null {
  if (!mpn) return null
  const match = String(mpn).trim().toUpperCase().match(MPN_REGEX)
  if (!match) return null
  const [, , prefix, serialStr] = match
  const serialNumber = parseInt(serialStr, 10)
  if (!Number.isFinite(serialNumber)) return null
  return {prefix: normalizePrefix(prefix), serialNumber, serial: formatSerial(serialNumber)}
}

async function reserveSerialNumber(
  client: SanityClient,
  requestedPrefix?: string | null,
): Promise<SerialInfo> {
  const prefix = normalizePrefix(requestedPrefix)

  const settings = await client.fetch<SettingsDoc>(
    `*[_type == $type][0]{_id, ${NEXT_SERIAL_FIELD}}`,
    {type: SETTINGS_TYPE},
  )

  const settingsId = settings?._id || SETTINGS_TYPE
  const startingValue =
    typeof settings?.nextMpnNumber === 'number' ? settings.nextMpnNumber : DEFAULT_STARTING_NUMBER

  await client.createIfNotExists({
    _id: settingsId,
    _type: SETTINGS_TYPE,
    title: SETTINGS_TITLE,
    [NEXT_SERIAL_FIELD]: startingValue,
  })

  const updatedSettings = await client
    .patch(settingsId)
    .setIfMissing({[NEXT_SERIAL_FIELD]: startingValue})
    .inc({[NEXT_SERIAL_FIELD]: 1})
    .commit({autoGenerateArrayKeys: true})

  const nextValue =
    typeof updatedSettings?.nextMpnNumber === 'number'
      ? updatedSettings.nextMpnNumber
      : startingValue + 1

  const serialNumber = nextValue - 1

  return {prefix, serialNumber, serial: formatSerial(serialNumber)}
}

export async function generateInitialMpn(
  client: SanityClient | undefined,
  options?: GenerateMpnOptions,
): Promise<{mpn: string; prefix: string; serial: string} | null> {
  if (!client) return null

  const reservation = await reserveSerialNumber(client, options?.categoryPrefix)
  return {
    mpn: buildMpn(reservation.prefix, reservation.serial),
    prefix: reservation.prefix,
    serial: reservation.serial,
  }
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

  if (hasSku && hasMpn) {
    log(`SKU/MPN already exist for ${product._id}; skipping generation.`)
    return {generated: false, skippedReason: 'existing codes'}
  }

  const parsedMpn = hasMpn ? parseMpn(product.mpn) : null
  const categoryPrefix = product.categoryPrefix

  let serialInfo: SerialInfo | null = parsedMpn
  if (!serialInfo && !hasMpn) {
    serialInfo = await reserveSerialNumber(client, categoryPrefix)
  }

  const updates: Record<string, string> = {}

  if (serialInfo) {
    if (!hasMpn) {
      updates.mpn = buildMpn(serialInfo.prefix, serialInfo.serial)
    }
    if (!hasSku) {
      updates.sku = buildSku(serialInfo.prefix, serialInfo.serial)
    }
  } else if (hasMpn && !hasSku && product.mpn) {
    updates.sku = product.mpn
    log(`MPN present but unparsable for ${product._id}; backfilling SKU with existing MPN value.`)
  }

  if (!Object.keys(updates).length) {
    log(`SKU/MPN already exist for ${product._id}; skipping generation.`)
    return {generated: false, skippedReason: 'existing codes'}
  }

  const productPatch = client.patch(product._id).set(updates)
  if (product._rev) {
    productPatch.ifRevisionId(product._rev)
  }

  await productPatch.commit({autoGenerateArrayKeys: true})

  const prefix = serialInfo?.prefix || normalizePrefix(categoryPrefix)
  const serial = serialInfo?.serial
  const generatedFields = Object.keys(updates).join(' & ') || 'codes'

  log(
    `Generated ${generatedFields} for ${product._id} (prefix=${prefix}${
      serial ? `, serial=${serial}` : ''
    }).`,
  )

  if (!product.categoryPrefix) {
    log(`No category prefix found for ${product._id}; used fallback ${FALLBACK_PREFIX}.`)
  }

  return {generated: true, ...updates, prefix, serial}
}
