#!/usr/bin/env tsx
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

dotenv.config()

type Scope = 'all' | 'packages' | 'trx'

type CliOptions = {
  apply: boolean
  verify: boolean
  scope: Scope
  productIds: string[]
  allowPriceMismatch: boolean
}

type SanityAddOn = {
  _key: string
  label: string
  priceDelta?: number
  medusaOptionId?: string
  medusaOptionValueId?: string
  syncedPriceCents?: number
  syncStatus?: string
}

type SanityProduct = {
  _id: string
  title?: string
  slug?: {current?: string}
  contentStatus?: string
  status?: string
  medusaProductId?: string
  medusaVariantId?: string
  addOns?: SanityAddOn[]
}

type MedusaPrice = {
  amount?: number
  currency_code?: string
}

type MedusaVariant = {
  id: string
  prices?: MedusaPrice[]
  calculated_price?: {
    calculated_amount?: number
    currency_code?: string
  }
}

type MedusaOptionValue = {
  id: string
  value: string
}

type MedusaOption = {
  id: string
  title: string
  values: MedusaOptionValue[]
}

type ProductCatalog = {
  productId: string
  options: MedusaOption[]
  variantPriceById: Map<string, number>
}

type AddOnResolution = {
  addOnKey: string
  label: string
  expectedDeltaCents: number
  medusaOptionId?: string
  medusaOptionValueId?: string
  matchedVariantId?: string
  resolvedDeltaCents?: number
  reason?: string
}

type ProductReport = {
  productId: string
  title: string
  medusaProductId: string
  medusaVariantId: string
  resolutions: AddOnResolution[]
  unresolvedCount: number
}

const GROUP_MAP: Record<string, {group: string; value: string}> = {
  'high temp ceramic coating - lid': {group: 'Ceramic Coating', value: 'Lid Only'},
  'high temp ceramic coating - full': {group: 'Ceramic Coating', value: 'Full'},
  'high temp ceramic paint - full': {group: 'Ceramic Coating', value: 'Full'},
  'high temp ceramic paint - lid': {group: 'Ceramic Coating', value: 'Lid Only'},
  'full ceramic high temp coating': {group: 'Ceramic Coating', value: 'Full'},
  'lid ceramic high temp coating': {group: 'Ceramic Coating', value: 'Lid Only'},
  'fast lane priority build': {group: 'Priority Processing', value: 'Fast Lane Priority'},
  'core exchange': {group: 'Core Handling', value: 'Core Exchange Program'},
  'core exchange program': {group: 'Core Handling', value: 'Core Exchange Program'},
  'purchase 2.4l core': {group: 'Core Handling', value: 'Purchase New Core'},
  'race bearing upgrade': {group: 'Bearing Upgrade', value: 'Race Bearings'},
  'upgraded ceramic race bearings': {group: 'Bearing Upgrade', value: 'Ceramic Race Bearings'},
  'ceramic race bearing upgrade': {group: 'Bearing Upgrade', value: 'Ceramic Race Bearings'},
  'blower case runner porting': {group: 'Runner Porting', value: 'Race Ported'},
  'shipping box': {group: 'Shipping Protection', value: 'Upgrade to Shipping Box'},
  'supercharger shipping box': {group: 'Shipping Protection', value: 'Upgrade to Shipping Box'},
  'green belt': {group: 'Belt Upgrade', value: 'Green Belt Upgrade'},
  'supercharger thermal blanket': {group: 'Thermal Blanket', value: 'Add Thermal Blanket'},
  'powder coating': {group: 'Finish', value: 'Powder Coated'},
  'coolant line kit': {group: 'Coolant Lines', value: 'Add Coolant Line Kit'},
  'ccv reroute': {group: 'CCV Reroute', value: 'Add CCV Reroute'},
  'dominator race elite': {group: 'Elite Package', value: 'Dominator Race Elite'},
  'ram trx 5" high flow cold air intake': {group: 'Air Intake Upgrade', value: 'Add TRX 5" Cold Air Intake'},
  'ram trx 5" high flow intake w/ heat shield': {
    group: 'Air Intake Upgrade',
    value: 'Add TRX 5" Intake System',
  },
  'high-flow race midpipes': {group: 'Midpipes', value: 'Add Race Midpipes'},
  'custom tuning': {group: 'Tuning', value: 'Add Custom Tuning'},
}

const normalizeLabel = (value: unknown): string =>
  String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*([-/–—])\s*/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2)
  const getValue = (flag: string): string | undefined => {
    const direct = args.find((arg) => arg.startsWith(`${flag}=`))
    if (direct) return direct.slice(flag.length + 1)
    const idx = args.indexOf(flag)
    if (idx >= 0 && args[idx + 1]) return args[idx + 1]
    return undefined
  }

  const scopeRaw = (getValue('--scope') || process.env.ADDON_SYNC_SCOPE || 'packages')
    .trim()
    .toLowerCase()
  const scope: Scope = scopeRaw === 'all' || scopeRaw === 'trx' ? (scopeRaw as Scope) : 'packages'

  const idArg = getValue('--product-ids') || process.env.TARGET_SANITY_PRODUCT_IDS || ''
  const productIds = idArg
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)

  return {
    apply: args.includes('--apply') || String(process.env.APPLY || '').toLowerCase() === 'true',
    verify:
      args.includes('--verify') || String(process.env.VERIFY_ADDON_MAPPING || '').toLowerCase() === 'true',
    scope,
    productIds,
    allowPriceMismatch:
      args.includes('--allow-price-mismatch') ||
      String(process.env.ALLOW_ADDON_PRICE_MISMATCH || '').toLowerCase() === 'true',
  }
}

const sanityProjectId =
  process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || process.env.SANITY_PROJECT
const sanityDataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'
const sanityToken = process.env.SANITY_API_TOKEN || process.env.SANITY_AUTH_TOKEN

const medusaApiUrlRaw =
  process.env.MEDUSA_API_URL || process.env.MEDUSA_BACKEND_URL || process.env.MEDUSA_ADMIN_URL
const medusaApiUrl = medusaApiUrlRaw ? medusaApiUrlRaw.trim().replace(/\/+$/, '') : ''
const medusaToken =
  process.env.MEDUSA_ADMIN_API_TOKEN || process.env.MEDUSA_ADMIN_TOKEN || process.env.MEDUSA_API_TOKEN
  || process.env.MEDUSA_PUBLISHABLE_KEY

if (!sanityProjectId || !sanityToken) {
  console.error('Missing Sanity credentials: SANITY_STUDIO_PROJECT_ID/SANITY_PROJECT_ID and SANITY_API_TOKEN are required.')
  process.exit(1)
}

if (!medusaApiUrl || !medusaToken) {
  console.error('Missing Medusa credentials: MEDUSA_API_URL and MEDUSA_ADMIN_API_TOKEN (or MEDUSA_API_TOKEN) are required.')
  process.exit(1)
}

const sanity = createClient({
  projectId: sanityProjectId,
  dataset: sanityDataset,
  token: sanityToken,
  apiVersion: '2025-10-22',
  useCdn: false,
})

const getMedusaHeaders = (): HeadersInit => {
  const token = String(medusaToken || '').trim()
  if (token.startsWith('pk_')) {
    return {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-publishable-api-key': token,
    }
  }

  return {
    accept: 'application/json',
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  }
}

const medusaRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${medusaApiUrl}${path}`, {
    ...init,
    headers: {
      ...getMedusaHeaders(),
      ...(init.headers || {}),
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Medusa ${response.status} ${path}: ${body}`)
  }

  return (await response.json()) as T
}

const toCents = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.round(value * 100)
}

const getUsdPrice = (variant: MedusaVariant): number | null => {
  const calculatedAmount =
    typeof variant?.calculated_price?.calculated_amount === 'number' &&
    String(variant?.calculated_price?.currency_code || 'usd').toLowerCase() === 'usd'
      ? variant.calculated_price.calculated_amount
      : null
  if (calculatedAmount !== null) return Math.round(calculatedAmount)

  const prices = Array.isArray(variant.prices) ? variant.prices : []
  const usd = prices.find((entry) => String(entry.currency_code || '').toLowerCase() === 'usd')
  const fallback = prices.find((entry) => typeof entry.amount === 'number')
  const amount = typeof usd?.amount === 'number' ? usd.amount : fallback?.amount
  return typeof amount === 'number' ? Math.round(amount) : null
}

const extractCatalog = (payload: any): ProductCatalog | null => {
  const product = payload?.product || payload || null
  if (!product?.id) return null

  const rawOptions = Array.isArray(product?.options) ? product.options : []
  const options: MedusaOption[] = rawOptions
    .map((option: any) => {
      const values = Array.isArray(option?.values) ? option.values : []
      return {
        id: String(option?.id || '').trim(),
        title: String(option?.title || '').trim(),
        values: values
          .map((value: any) => ({
            id: String(value?.id || value?.value_id || '').trim(),
            value: String(value?.value || value?.title || '').trim(),
          }))
          .filter((value: MedusaOptionValue) => Boolean(value.id && value.value)),
      }
    })
    .filter((option: MedusaOption) => Boolean(option.id && option.title))

  const variants = Array.isArray(product?.variants) ? product.variants : []
  const variantPriceById = new Map<string, number>()
  for (const variant of variants) {
    const id = String(variant?.id || '').trim()
    if (!id) continue
    const price = getUsdPrice(variant)
    if (price !== null) variantPriceById.set(id, price)
  }

  return {
    productId: String(product.id),
    options,
    variantPriceById,
  }
}

const fetchProductCatalog = async (medusaProductId: string, medusaVariantId: string): Promise<ProductCatalog> => {
  const paths = [
    `/store/products/${medusaProductId}?fields=*variants,*variants.calculated_price,*options,*options.values`,
    `/admin/products/${medusaProductId}`,
    `/store/products/${medusaProductId}`,
    `/store/variants/${medusaVariantId}`,
  ]

  for (const path of paths) {
    try {
      const payload = await medusaRequest<any>(path)
      const catalog = extractCatalog(payload)
      if (catalog && catalog.options.length > 0) return catalog
    } catch {
      // try next path
    }
  }

  throw new Error(`Unable to load Medusa option catalog for product ${medusaProductId}`)
}

const resolveVariant = async (
  baseVariantId: string,
  optionValueIds: string[],
): Promise<{variantId: string; reason?: string}> => {
  const payload = await medusaRequest<any>('/store/resolve-variant', {
    method: 'POST',
    body: JSON.stringify({
      base_variant_id: baseVariantId,
      option_value_ids: optionValueIds,
    }),
  })

  return {
    variantId: String(payload?.variant_id || '').trim(),
    reason: typeof payload?.reason === 'string' ? payload.reason : undefined,
  }
}

const shouldIncludeProduct = (product: SanityProduct, opts: CliOptions): boolean => {
  if (opts.productIds.length > 0 && !opts.productIds.includes(product._id)) return false

  const contentStatus = String(product.contentStatus || '').trim().toLowerCase()
  const status = String(product.status || '').trim().toLowerCase()
  if (contentStatus && contentStatus !== 'published') return false
  if (status && status !== 'active') return false

  const title = String(product.title || '').toLowerCase()
  if (opts.scope === 'all') return true
  if (opts.scope === 'trx') return title.includes('trx')
  return title.includes('package')
}

const fetchProducts = async (opts: CliOptions): Promise<SanityProduct[]> => {
  const products = await sanity.fetch<SanityProduct[]>(
    `*[_type == "product" && defined(medusaProductId) && defined(medusaVariantId) && count(addOns) > 0]{
      _id,
      title,
      slug,
      contentStatus,
      status,
      medusaProductId,
      medusaVariantId,
      addOns[]{
        _key,
        label,
        priceDelta,
        medusaOptionId,
        medusaOptionValueId,
        syncedPriceCents,
        syncStatus
      }
    }`,
  )

  return (Array.isArray(products) ? products : []).filter((product) => shouldIncludeProduct(product, opts))
}

const resolveAddOn = async (
  product: SanityProduct,
  addOn: SanityAddOn,
  catalog: ProductCatalog,
  basePriceCents: number,
  opts: CliOptions,
): Promise<AddOnResolution> => {
  const normalized = normalizeLabel(addOn.label)
  const expectedDeltaCents = toCents(addOn.priceDelta)

  const mapped = GROUP_MAP[normalized]
  if (!mapped) {
    return {
      addOnKey: addOn._key,
      label: addOn.label,
      expectedDeltaCents,
      reason: 'no_group_mapping',
    }
  }

  const option = catalog.options.find(
    (entry) => normalizeLabel(entry.title) === normalizeLabel(mapped.group),
  )
  if (!option) {
    return {
      addOnKey: addOn._key,
      label: addOn.label,
      expectedDeltaCents,
      reason: `option_not_found:${mapped.group}`,
    }
  }

  const optionValue = option.values.find(
    (entry) => normalizeLabel(entry.value) === normalizeLabel(mapped.value),
  )
  if (!optionValue) {
    return {
      addOnKey: addOn._key,
      label: addOn.label,
      expectedDeltaCents,
      medusaOptionId: option.id,
      reason: `option_value_not_found:${mapped.value}`,
    }
  }

  const resolved = await resolveVariant(String(product.medusaVariantId || ''), [optionValue.id])
  if (!resolved.variantId || resolved.reason === 'no_matching_variant') {
    return {
      addOnKey: addOn._key,
      label: addOn.label,
      expectedDeltaCents,
      medusaOptionId: option.id,
      medusaOptionValueId: optionValue.id,
      reason: resolved.reason || 'no_matching_variant',
    }
  }

  const resolvedPrice = catalog.variantPriceById.get(resolved.variantId)
  if (typeof resolvedPrice !== 'number') {
    return {
      addOnKey: addOn._key,
      label: addOn.label,
      expectedDeltaCents,
      medusaOptionId: option.id,
      medusaOptionValueId: optionValue.id,
      matchedVariantId: resolved.variantId,
      reason: 'resolved_variant_price_missing',
    }
  }

  const delta = resolvedPrice - basePriceCents
  if (!opts.allowPriceMismatch && delta !== expectedDeltaCents) {
    return {
      addOnKey: addOn._key,
      label: addOn.label,
      expectedDeltaCents,
      medusaOptionId: option.id,
      medusaOptionValueId: optionValue.id,
      matchedVariantId: resolved.variantId,
      resolvedDeltaCents: delta,
      reason: `price_delta_mismatch:${delta}`,
    }
  }

  return {
    addOnKey: addOn._key,
    label: addOn.label,
    expectedDeltaCents,
    medusaOptionId: option.id,
    medusaOptionValueId: optionValue.id,
    matchedVariantId: resolved.variantId,
    resolvedDeltaCents: delta,
  }
}

const patchProduct = async (product: SanityProduct, report: ProductReport): Promise<void> => {
  const patch = sanity.patch(product._id)
  const nowIso = new Date().toISOString()

  for (const entry of report.resolutions) {
    if (entry.medusaOptionId && entry.medusaOptionValueId && !entry.reason) {
      patch.set({
        [`addOns[_key=="${entry.addOnKey}"].medusaOptionId`]: entry.medusaOptionId,
        [`addOns[_key=="${entry.addOnKey}"].medusaOptionValueId`]: entry.medusaOptionValueId,
        [`addOns[_key=="${entry.addOnKey}"].syncedPriceCents`]: entry.expectedDeltaCents,
        [`addOns[_key=="${entry.addOnKey}"].lastSyncedAt`]: nowIso,
        [`addOns[_key=="${entry.addOnKey}"].syncStatus`]: 'synced',
      })
    } else {
      patch.set({
        [`addOns[_key=="${entry.addOnKey}"].lastSyncedAt`]: nowIso,
        [`addOns[_key=="${entry.addOnKey}"].syncStatus`]: 'error',
      })
    }
  }

  await patch.commit()
}

const run = async () => {
  const opts = parseArgs()

  console.log('============================================================')
  console.log('Sanity -> Medusa Add-On Mapping Sync')
  console.log('============================================================')
  console.log(`Mode: ${opts.apply ? 'APPLY' : 'DRY-RUN'}`)
  console.log(`Verify mode: ${opts.verify ? 'ON' : 'OFF'}`)
  console.log(`Scope: ${opts.scope}`)
  if (opts.productIds.length > 0) {
    console.log(`Target product IDs: ${opts.productIds.join(', ')}`)
  }

  const products = await fetchProducts(opts)
  console.log(`Loaded ${products.length} candidate product(s).`)

  const reports: ProductReport[] = []

  for (const product of products) {
    const medusaProductId = String(product.medusaProductId || '').trim()
    const medusaVariantId = String(product.medusaVariantId || '').trim()
    if (!medusaProductId || !medusaVariantId) continue

    const catalog = await fetchProductCatalog(medusaProductId, medusaVariantId)
    const basePriceCents = catalog.variantPriceById.get(medusaVariantId)
    if (typeof basePriceCents !== 'number') {
      throw new Error(`Base variant ${medusaVariantId} is missing USD price in Medusa.`)
    }

    const resolutions: AddOnResolution[] = []
    for (const addOn of product.addOns || []) {
      resolutions.push(await resolveAddOn(product, addOn, catalog, basePriceCents, opts))
    }

    const unresolvedCount = resolutions.filter((entry) => Boolean(entry.reason)).length
    const report: ProductReport = {
      productId: product._id,
      title: String(product.title || product._id),
      medusaProductId,
      medusaVariantId,
      resolutions,
      unresolvedCount,
    }

    reports.push(report)

    console.log(`\n- ${report.title} (${report.productId})`)
    console.log(`  Base variant: ${report.medusaVariantId}`)
    for (const row of report.resolutions) {
      if (row.reason) {
        console.log(`  ✗ ${row.label} -> ${row.reason}`)
      } else {
        console.log(
          `  ✓ ${row.label} -> ${row.medusaOptionId}/${row.medusaOptionValueId} (delta=${row.resolvedDeltaCents})`,
        )
      }
    }

    if (opts.apply) {
      await patchProduct(product, report)
    }
  }

  const unresolved = reports.flatMap((report) =>
    report.resolutions
      .filter((entry) => Boolean(entry.reason))
      .map((entry) => ({
        productId: report.productId,
        title: report.title,
        label: entry.label,
        reason: entry.reason,
      })),
  )

  const summary = {
    productsProcessed: reports.length,
    totalAddOns: reports.reduce((sum, report) => sum + report.resolutions.length, 0),
    unresolvedCount: unresolved.length,
  }

  console.log('\n============================================================')
  console.log('Summary')
  console.log('============================================================')
  console.log(JSON.stringify(summary, null, 2))

  if (unresolved.length > 0) {
    console.log('\nUnresolved add-ons:')
    for (const row of unresolved) {
      console.log(`- ${row.productId} | ${row.title} | ${row.label} | ${row.reason}`)
    }
  }

  if (opts.verify && unresolved.length > 0) {
    process.exitCode = 1
  }
}

run().catch((error) => {
  console.error('addon-mapping-sync failed:', error)
  process.exit(1)
})
