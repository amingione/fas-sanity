import type {SanityClient} from '@sanity/client'
import {generateFasSKU} from './generateSKU'

const BRAND_SUFFIX = 'FAS'
const DEFAULT_STARTING_NUMBER = 636
const SETTINGS_TYPE = 'siteSettings'
const SETTINGS_TITLE = 'Site Settings'
const NEXT_SERIAL_FIELD = 'nextMpnNumber'
const SERIAL_PAD_LENGTH = 4
const SKU_PATTERN = /^[A-Z]{2}-[A-Z0-9]{4}-[A-Z]{3}$/
const MPN_PATTERN = /^[A-Z]{2}-[A-Z0-9]{4}$/

type ProductForCodes = {
  _id: string
  _rev?: string
  sku?: string
  mpn?: string
  title?: string | null
  platform?: string | null
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

function normalizePrefix(prefix?: string | null): string {
  const trimmed = typeof prefix === 'string' ? prefix.trim() : ''
  return trimmed ? trimmed.toUpperCase() : 'UN'
}

function formatSerial(serialNumber: number): string {
  const safe = Number.isFinite(serialNumber) ? serialNumber : DEFAULT_STARTING_NUMBER
  return String(safe).padStart(SERIAL_PAD_LENGTH, '0')
}

function buildMpn(engine: string, packageCode: string): string {
  return `${engine}-${packageCode}`
}

function buildSku(engine: string, packageCode: string): string {
  return `${engine}-${packageCode}-${BRAND_SUFFIX}`
}

function normalizeValue(value?: string | null): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function parseSku(sku?: string | null): {engine: string; packageCode: string} | null {
  const normalized = normalizeValue(sku)
  if (!SKU_PATTERN.test(normalized)) return null
  const [engine, packageCode] = normalized.split('-', 2)
  return engine && packageCode ? {engine, packageCode} : null
}

function parseMpn(mpn?: string | null): {engine: string; packageCode: string} | null {
  const normalized = normalizeValue(mpn)
  if (!MPN_PATTERN.test(normalized)) return null
  const [engine, packageCode] = normalized.split('-', 2)
  return engine && packageCode ? {engine, packageCode} : null
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
    `*[_id == $productId][0]{_id, _rev, sku, mpn, title, platform}`,
    {productId},
  )

  if (!product) {
    log(`No product found for id ${productId}; skipping code generation.`)
    return {generated: false, skippedReason: 'missing product'}
  }

  const normalizedSku = normalizeValue(product.sku)
  const normalizedMpn = normalizeValue(product.mpn)
  const hasMpn = normalizedMpn !== ''
  const skuData = parseSku(normalizedSku)
  const mpnData = parseMpn(normalizedMpn)
  const skuValid = Boolean(skuData)
  const mpnValid = Boolean(mpnData)

  if (skuValid && mpnValid) {
    log(`SKU/MPN already exist for ${product._id}; skipping generation.`)
    return {generated: false, skippedReason: 'existing codes'}
  }

  const updates: Record<string, string> = {}

  if (skuValid && skuData && !mpnValid) {
    updates.mpn = buildMpn(skuData.engine, skuData.packageCode)
  } else if (!skuValid && mpnValid && mpnData) {
    updates.sku = buildSku(mpnData.engine, mpnData.packageCode)
  } else if (!skuValid) {
    const generatedSku = await generateFasSKU(
      product.title ? String(product.title) : '',
      product.platform ? String(product.platform) : '',
      client,
    )
    updates.sku = generatedSku
    if (!hasMpn) {
      const generatedMpn = generatedSku.replace(`-${BRAND_SUFFIX}`, '')
      updates.mpn = generatedMpn
    }
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

  const generatedFields = Object.keys(updates).join(' & ') || 'codes'

  log(`Generated ${generatedFields} for ${product._id}.`)

  return {generated: true, ...updates}
}
