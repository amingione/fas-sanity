import {PDFDocument, StandardFonts, rgb} from 'pdf-lib'
import type {PDFFont, PDFImage, PDFPage} from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import {deriveOptionsFromMetadata} from './stripeCartItem'
import {PrintSettings, darkenRgb, hexToRgb, lightenRgb} from './printSettings'

export type InvoiceAddress = {
  name?: string | null
  company?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city_locality?: string | null
  state_province?: string | null
  postal_code?: string | null
  country_code?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
}

export type InvoiceLineItem = {
  description?: string | null
  sku?: string | null
  itemCode?: string | null
  itemName?: string | null
  quantity?: number | null
  unitPrice?: number | null
  lineTotal?: number | null
  amount?: number | null
  name?: string | null
  productName?: string | null
  price?: number | null
  total?: number | null
  optionSummary?: string | null
  optionDetails?: Array<string | null> | string | null
  upgrades?: Array<string | null> | string | null
  validationIssues?: Array<string | null> | string | null
  metadata?: Array<Record<string, unknown>> | null
  _key?: string | null
}

export type OrderCartItem = {
  _key?: string | null
  name?: string | null
  productName?: string | null
  sku?: string | null
  quantity?: number | null
  price?: number | null
  lineTotal?: number | null
  total?: number | null
  optionSummary?: string | null
  optionDetails?: Array<string | null> | string | null
  upgrades?: Array<string | null> | string | null
  validationIssues?: Array<string | null> | string | null
  metadata?: Array<{key?: string | null; value?: unknown}> | null
}

export type InvoiceLike = {
  invoiceNumber?: string | null
  invoiceDate?: string | null
  dueDate?: string | null
  billTo?: InvoiceAddress | null
  shipTo?: InvoiceAddress | null
  lineItems?: InvoiceLineItem[] | null
  discountType?: 'amount' | 'percent' | string | null
  discountValue?: number | null
  taxRate?: number | null
  customerNotes?: string | null
  terms?: string | null
  amountSubtotal?: number | null
  amountTax?: number | null
  amountShipping?: number | null
  shippingAmount?: number | null
  shippingCarrier?: string | null
  trackingNumber?: string | null
  shippingLabelUrl?: string | null
  order?: {
    cart?: OrderCartItem[] | null
    amountSubtotal?: number | null
    amountTax?: number | null
    amountShipping?: number | null
    shippingCarrier?: string | null
    trackingNumber?: string | null
    shippingLabelUrl?: string | null
    selectedService?: {
      carrier?: string | null
      service?: string | null
      amount?: number | null
    } | null
  } | null
  orderRef?: {
    cart?: OrderCartItem[] | null
    amountSubtotal?: number | null
    amountTax?: number | null
    amountShipping?: number | null
    shippingCarrier?: string | null
    trackingNumber?: string | null
    shippingLabelUrl?: string | null
    selectedService?: {
      carrier?: string | null
      service?: string | null
      amount?: number | null
    } | null
  } | null
  [key: string]: unknown
}

export type InvoiceTotals = {
  subtotal: number
  discountAmt: number
  taxAmount: number
  shipping: number
  total: number
}

type BrandTheme = {
  name: string
  street: string
  city: string
  phone: string
  email: string
  logoPath: string
  website?: string
  accent: ReturnType<typeof rgb>
  slate: ReturnType<typeof rgb>
  slateDark: ReturnType<typeof rgb>
  slateMuted: ReturnType<typeof rgb>
  borderColor?: ReturnType<typeof rgb>
  headerLineColor?: ReturnType<typeof rgb>
  tableHeaderBg?: ReturnType<typeof rgb>
  tableAltBg?: ReturnType<typeof rgb>
  totalsHighlight?: ReturnType<typeof rgb>
  logoUrl?: string
}

const brandTheme: BrandTheme = {
  name: 'F.A.S. Motorsports LLC',
  street: '6161 Riverside Dr',
  city: 'Punta Gorda, FL 33982',
  phone: '(812) 200-9012',
  email: 'sales@fasmotorsports.com',
  logoPath: path.resolve(process.cwd(), 'public/media/New Red FAS Logo.png'),
  website: 'www.fasmotorsports.com',
  accent: rgb(0.86, 0.23, 0.18),
  slate: rgb(100 / 255, 116 / 255, 139 / 255),
  slateDark: rgb(51 / 255, 65 / 255, 85 / 255),
  slateMuted: rgb(148 / 255, 163 / 255, 184 / 255),
  borderColor: rgb(226 / 255, 232 / 255, 240 / 255),
  headerLineColor: rgb(203 / 255, 213 / 255, 225 / 255),
  tableHeaderBg: rgb(241 / 255, 245 / 255, 249 / 255),
  tableAltBg: rgb(249 / 255, 250 / 255, 251 / 255),
  totalsHighlight: rgb(236 / 255, 254 / 255, 255 / 255),
}

type Fonts = {
  regular: PDFFont
  bold: PDFFont
  italic: PDFFont
  boldItalic: PDFFont
}

type FontSelection = {
  regular: StandardFonts
  bold: StandardFonts
  italic: StandardFonts
  boldItalic: StandardFonts
}

type InvoiceRenderOptions = {
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  printSettings?: PrintSettings | null
  logoUrl?: string
}

export type InvoicePdfResult = {
  bytes: Uint8Array
  base64: string
}

export function money(value: number | null | undefined = 0): string {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0
  const sign = numeric < 0 ? '-' : ''
  const absolute = Math.abs(numeric)
  return `${sign}$${absolute.toFixed(2)}`
}

export function computeInvoiceTotals(doc: InvoiceLike | null | undefined): InvoiceTotals {
  const items = Array.isArray(doc?.lineItems) ? doc?.lineItems || [] : []
  const discountType = doc?.discountType === 'percent' ? 'percent' : 'amount'
  const discountValue = Number(doc?.discountValue || 0)
  const taxRate = Number(doc?.taxRate || 0)
  const shipping = extractShippingAmount(doc)

  const subtotal = items.reduce((sum, li) => {
    const qty = Number(li?.quantity ?? 1)
    const unit = Number(li?.unitPrice ?? li?.amount ?? li?.price ?? 0)
    const overrideCandidate =
      typeof li?.lineTotal === 'number' && Number.isFinite(li?.lineTotal)
        ? Number(li?.lineTotal)
        : typeof (li as any)?.total === 'number' && Number.isFinite((li as any)?.total)
          ? Number((li as any)?.total)
          : undefined
    const override = overrideCandidate
    const line = typeof override === 'number' ? override : qty * unit
    return sum + (Number.isFinite(line) ? line : 0)
  }, 0)

  const discountAmt = discountType === 'percent' ? subtotal * (discountValue / 100) : discountValue
  const taxableBase = Math.max(0, subtotal - discountAmt)
  const taxAmount = taxableBase * (taxRate / 100)
  const total = Math.max(0, taxableBase + taxAmount + shipping)

  return {subtotal, discountAmt, taxAmount, shipping, total}
}

function prepareInvoice(invoice: InvoiceLike | null | undefined): InvoiceLike {
  const clone: InvoiceLike = {...(invoice || {})}
  clone.lineItems = normalizeInvoiceLineItems(invoice)
  clone.amountShipping = extractShippingAmount(clone)
  return clone
}

export function normalizeInvoiceLineItems(
  invoice: InvoiceLike | null | undefined,
): InvoiceLineItem[] {
  const invoiceItems = Array.isArray(invoice?.lineItems)
    ? (invoice?.lineItems || []).filter(Boolean)
    : []
  const cartItems = extractCartItems(invoice)
  const usedIndices = new Set<number>()
  const normalized: InvoiceLineItem[] = []

  for (const item of invoiceItems) {
    const matchIdx = findMatchingCartItem(item, cartItems, usedIndices)
    const merged = combineLineItems(item, matchIdx >= 0 ? cartItems[matchIdx] : undefined)
    if (merged) normalized.push(merged)
    if (matchIdx >= 0) usedIndices.add(matchIdx)
  }

  for (let index = 0; index < cartItems.length; index += 1) {
    if (usedIndices.has(index)) continue
    const merged = combineLineItems(undefined, cartItems[index])
    if (merged) normalized.push(merged)
  }

  return normalized
}

function extractCartItems(invoice: InvoiceLike | null | undefined): OrderCartItem[] {
  const lists: Array<OrderCartItem[] | null | undefined> = [
    (invoice as any)?.orderRef?.cart,
    (invoice as any)?.order?.cart,
  ]
  const seen = new Set<string>()
  const items: OrderCartItem[] = []
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const raw of list) {
      if (!raw) continue
      const sku = normalizeString(raw.sku)
      const key = normalizeString(raw._key) || ''
      const signature = `${key}|${sku}|${normalizeString(raw.name)}`
      if (seen.has(signature)) continue
      seen.add(signature)
      items.push(raw)
    }
  }
  return items
}

function findMatchingCartItem(
  lineItem: InvoiceLineItem,
  cartItems: OrderCartItem[],
  used: Set<number>,
): number {
  const sku = normalizeString(lineItem?.sku)
  if (sku) {
    for (let index = 0; index < cartItems.length; index += 1) {
      if (used.has(index)) continue
      if (normalizeString(cartItems[index]?.sku) === sku) return index
    }
  }

  const name = normalizeString((lineItem as any)?.name || lineItem?.description)
  if (name) {
    for (let index = 0; index < cartItems.length; index += 1) {
      if (used.has(index)) continue
      const cartName = normalizeString(cartItems[index]?.name || cartItems[index]?.productName)
      if (cartName && cartName === name) return index
    }
  }

  return -1
}

function combineLineItems(
  invoiceItem?: InvoiceLineItem | null,
  cartItem?: OrderCartItem | null,
): InvoiceLineItem | null {
  const source = invoiceItem || cartItem
  if (!source) return null

  const merged: Record<string, any> = {}
  if (cartItem && typeof cartItem === 'object') Object.assign(merged, cartItem)
  if (invoiceItem && typeof invoiceItem === 'object') Object.assign(merged, invoiceItem)

  const quantity = coalesceNumber(
    invoiceItem?.quantity,
    (invoiceItem as any)?.qty,
    cartItem?.quantity,
  )
  if (quantity !== undefined) merged.quantity = quantity

  const unitPrice = coalesceNumber(
    invoiceItem?.unitPrice,
    (invoiceItem as any)?.amount,
    cartItem?.price,
  )
  if (unitPrice !== undefined) merged.unitPrice = unitPrice

  const lineTotal = coalesceNumber(
    invoiceItem?.lineTotal,
    (invoiceItem as any)?.total,
    cartItem?.lineTotal,
    cartItem?.total,
    typeof unitPrice === 'number' && typeof quantity === 'number'
      ? unitPrice * quantity
      : undefined,
  )
  if (lineTotal !== undefined) merged.lineTotal = lineTotal

  const collectedMetadata: Array<{key?: string | null; value?: unknown}> = []
  if (Array.isArray((invoiceItem as any)?.metadata)) {
    collectedMetadata.push(
      ...((invoiceItem as any)?.metadata as Array<{key?: string | null; value?: unknown}>),
    )
  }
  const cartItemMetadataEntries = Array.isArray((cartItem as any)?.metadataEntries)
    ? ((cartItem as any)?.metadataEntries as Array<{key?: string | null; value?: unknown}>)
    : Array.isArray(cartItem?.metadata)
      ? (cartItem?.metadata as Array<{key?: string | null; value?: unknown}>)
      : []
  if (cartItemMetadataEntries.length) {
    collectedMetadata.push(...cartItemMetadataEntries)
  }
  const derived = deriveOptionsFromMetadata(collectedMetadata.length ? collectedMetadata : null)

  const optionSummary = coalesceString(
    (invoiceItem as any)?.optionSummary,
    (invoiceItem as any)?.optionsSummary,
    cartItem?.optionSummary,
    derived.optionSummary,
  )

  const optionDetails = mergeUniqueStrings(
    toStringArray((invoiceItem as any)?.optionDetails),
    toStringArray((invoiceItem as any)?.options),
    toStringArray(cartItem?.optionDetails),
    derived.optionDetails,
  )

  const upgrades = mergeUniqueStrings(
    toStringArray((invoiceItem as any)?.upgrades),
    toStringArray((invoiceItem as any)?.upgradeOptions),
    toStringArray(cartItem?.upgrades),
    derived.upgrades,
  )

  const validationIssues = mergeUniqueStrings(
    toStringArray((invoiceItem as any)?.validationIssues),
    toStringArray(cartItem?.validationIssues),
  )

  if (optionSummary) merged.optionSummary = optionSummary
  if (optionDetails.length) merged.optionDetails = optionDetails
  if (upgrades.length) merged.upgrades = upgrades
  if (validationIssues.length) merged.validationIssues = validationIssues

  if (!merged.sku) merged.sku = coalesceString(invoiceItem?.sku, cartItem?.sku)

  const nameCandidate = coalesceString(
    (invoiceItem as any)?.name,
    cartItem?.name,
    cartItem?.productName,
  )
  if (!normalizeString(merged.description) && nameCandidate) {
    merged.description = nameCandidate
  }

  if (cartItem?._key && !merged._key) merged._key = cartItem._key

  return merged
}

function toStringArray(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeString(typeof item === 'string' ? item : toStringValue(item)))
      .filter(Boolean) as string[]
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return toStringArray(parsed)
      } catch {
        // ignore parse error
      }
    }
    return trimmed
      .split(/[,;|]/g)
      .map((part) => normalizeString(part))
      .filter(Boolean) as string[]
  }
  return [normalizeString(toStringValue(value))].filter(Boolean) as string[]
}

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function mergeUniqueStrings(...arrays: string[][]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const array of arrays) {
    for (const value of array) {
      if (!value || seen.has(value)) continue
      seen.add(value)
      result.push(value)
    }
  }
  return result
}

function coalesceString(...values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    const normalized = normalizeString(value)
    if (normalized) return normalized
  }
  return undefined
}

function coalesceNumber(...values: Array<number | null | undefined>): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

function extractShippingAmount(invoice: InvoiceLike | null | undefined): number {
  const rawCandidates: Array<number | string | null | undefined> = [
    (invoice as any)?.amountShipping,
    (invoice as any)?.shippingAmount,
    (invoice as any)?.orderRef?.amountShipping,
    (invoice as any)?.order?.amountShipping,
    (invoice as any)?.orderRef?.selectedService?.amount,
    (invoice as any)?.order?.selectedService?.amount,
  ]

  for (const raw of rawCandidates) {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    if (typeof raw === 'string') {
      const parsed = Number(raw)
      if (Number.isFinite(parsed)) return parsed
    }
  }

  return 0
}

const FONT_FAMILY_MAP: Record<'Helvetica' | 'Arial' | 'Times' | 'Courier', FontSelection> = {
  Helvetica: {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique,
  },
  Arial: {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique,
  },
  Times: {
    regular: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    boldItalic: StandardFonts.TimesRomanBoldItalic,
  },
  Courier: {
    regular: StandardFonts.Courier,
    bold: StandardFonts.CourierBold,
    italic: StandardFonts.CourierOblique,
    boldItalic: StandardFonts.CourierBoldOblique,
  },
}

const DEFAULT_FONT_FAMILY: keyof typeof FONT_FAMILY_MAP = 'Helvetica'

export async function renderInvoicePdf(
  invoice: InvoiceLike | null | undefined,
  options: InvoiceRenderOptions = {},
): Promise<InvoicePdfResult> {
  const settings = options.printSettings ?? null
  const pdf = await PDFDocument.create()
  const pageSize = settings?.layout?.pageSize === 'a4' ? [595.28, 841.89] : [612, 792]
  const page = pdf.addPage(pageSize as [number, number])

  const familyKey = (settings?.typography?.fontFamily ??
    DEFAULT_FONT_FAMILY) as keyof typeof FONT_FAMILY_MAP
  const selection = FONT_FAMILY_MAP[familyKey] ?? FONT_FAMILY_MAP[DEFAULT_FONT_FAMILY]
  const fonts: Fonts = {
    regular: await pdf.embedFont(selection.regular),
    bold: await pdf.embedFont(selection.bold),
    italic: await pdf.embedFont(selection.italic),
    boldItalic: await pdf.embedFont(selection.boldItalic),
  }

  const showLogo = settings?.invoiceSettings?.showLogo !== false
  const logo = showLogo ? await loadLogo(pdf, brandTheme.logoPath, options.logoUrl) : null
  const normalizedInvoice = prepareInvoice(invoice)
  const totals = computeInvoiceTotals(normalizedInvoice)

  const invoiceNumber =
    normalizeString(
      options.invoiceNumber ?? normalizedInvoice?.invoiceNumber ?? options.invoiceNumber ?? '',
    ) || '—'
  const invoiceDate = normalizeDate(options.invoiceDate ?? normalizedInvoice?.invoiceDate)
  const dueDate = normalizeDate(options.dueDate ?? normalizedInvoice?.dueDate)

  const companyAddressLines = (settings?.companyAddress ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const street = companyAddressLines[0] || brandTheme.street
  const city = companyAddressLines.slice(1).join(', ') || brandTheme.city

  const accentRgb = hexToRgb(settings?.primaryColor?.hex, {r: 0.86, g: 0.23, b: 0.18})
  const textRgb = hexToRgb(settings?.textColor?.hex, {r: 100 / 255, g: 116 / 255, b: 139 / 255})
  const headingRgb = darkenRgb(accentRgb, 0.15)
  const secondaryRgb = settings?.secondaryColor?.hex
    ? hexToRgb(settings.secondaryColor.hex, lightenRgb(textRgb, 0.4))
    : lightenRgb(textRgb, 0.4)
  const borderRgb = lightenRgb(textRgb, 0.55)
  const headerLineRgb = lightenRgb(textRgb, 0.45)
  const tableHeaderRgb = lightenRgb(secondaryRgb, 0.55)
  const tableAltRgb = lightenRgb(secondaryRgb, 0.75)
  const totalsHighlightRgb = lightenRgb(accentRgb, 0.6)

  const brand: BrandTheme = {
    ...brandTheme,
    name: settings?.companyName?.trim() || brandTheme.name,
    street,
    city,
    phone: settings?.companyPhone?.trim() || brandTheme.phone,
    email: settings?.companyEmail?.trim() || brandTheme.email,
    website: settings?.companyWebsite?.trim() || brandTheme.website,
    accent: rgb(accentRgb.r, accentRgb.g, accentRgb.b),
    slate: rgb(textRgb.r, textRgb.g, textRgb.b),
    slateDark: rgb(headingRgb.r, headingRgb.g, headingRgb.b),
    slateMuted: rgb(secondaryRgb.r, secondaryRgb.g, secondaryRgb.b),
    borderColor: rgb(borderRgb.r, borderRgb.g, borderRgb.b),
    headerLineColor: rgb(headerLineRgb.r, headerLineRgb.g, headerLineRgb.b),
    tableHeaderBg: rgb(tableHeaderRgb.r, tableHeaderRgb.g, tableHeaderRgb.b),
    tableAltBg: rgb(tableAltRgb.r, tableAltRgb.g, tableAltRgb.b),
    totalsHighlight: rgb(totalsHighlightRgb.r, totalsHighlightRgb.g, totalsHighlightRgb.b),
    logoUrl: options.logoUrl,
  }

  const showPaymentTerms = settings?.invoiceSettings?.showPaymentTerms !== false
  const invoiceNotes = collectNotes(normalizedInvoice, showPaymentTerms)
  if (invoiceNotes.length === 0) {
    invoiceNotes.push('Payment is due upon receipt.')
    invoiceNotes.push('Thank you for your business!')
  }
  const footerText = settings?.invoiceSettings?.footerText ?? ''
  if (footerText) {
    const footerLines = footerText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    invoiceNotes.push(...footerLines)
  }

  const headerText = settings?.invoiceSettings?.headerText?.trim() || 'INVOICE'

  drawInvoice({
    page,
    fonts,
    logo,
    brand,
    invoice: normalizedInvoice,
    invoiceNumber,
    invoiceDate,
    dueDate,
    totals,
    notes: invoiceNotes,
    headerText,
  })

  const bytes = await pdf.save({useObjectStreams: false})
  return {bytes, base64: Buffer.from(bytes).toString('base64')}
}

type DrawContext = {
  page: PDFPage
  fonts: Fonts
  logo: PDFImage | undefined | null
  brand: BrandTheme
  invoice: InvoiceLike
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  totals: InvoiceTotals
  notes: string[]
  headerText: string
}

function drawInvoice({
  page,
  fonts,
  logo,
  brand,
  invoice,
  invoiceNumber,
  invoiceDate,
  dueDate,
  totals,
  notes,
  headerText,
}: DrawContext) {
  const width = page.getWidth()
  const height = page.getHeight()
  const margin = 40
  const containerLeft = margin
  const containerRight = width - margin
  let y = height - margin

  const headingColor = brand.slateDark
  const textColor = brand.slate
  const mutedText = brand.slateMuted
  const borderColor = brand.borderColor ?? rgb(226 / 255, 232 / 255, 240 / 255)
  const headerLineColor = brand.headerLineColor ?? rgb(203 / 255, 213 / 255, 225 / 255)
  const tableHeaderBg = brand.tableHeaderBg ?? rgb(241 / 255, 245 / 255, 249 / 255)
  const tableAltBg = brand.tableAltBg ?? rgb(249 / 255, 250 / 255, 251 / 255)
  const totalsHighlight = brand.totalsHighlight ?? rgb(236 / 255, 254 / 255, 255 / 255)

  // Header block
  const headerTop = y
  let infoX = containerLeft
  let headerBaseline = headerTop - 14
  if (logo) {
    const desiredHeight = 48
    const scale = desiredHeight / logo.height
    const logoWidth = logo.width * scale
    const logoHeight = logo.height * scale
    const logoY = headerTop - logoHeight
    page.drawImage(logo, {x: containerLeft, y: logoY, width: logoWidth, height: logoHeight})
    infoX += logoWidth + 16
    headerBaseline = Math.min(headerBaseline, logoY - 4)
  }

  let infoY = headerTop - 8
  page.drawText(brand.name, {x: infoX, y: infoY, size: 17, font: fonts.bold, color: rgb(0, 0, 0)})
  infoY -= 18
  page.drawText(brand.street, {x: infoX, y: infoY, size: 10, font: fonts.regular, color: textColor})
  infoY -= 12
  page.drawText(brand.city, {x: infoX, y: infoY, size: 10, font: fonts.regular, color: textColor})
  infoY -= 12
  page.drawText(`Phone: ${brand.phone}`, {
    x: infoX,
    y: infoY,
    size: 10,
    font: fonts.regular,
    color: textColor,
  })
  infoY -= 12
  page.drawText(`Email: ${brand.email}`, {
    x: infoX,
    y: infoY,
    size: 10,
    font: fonts.regular,
    color: textColor,
  })

  const invoiceTitle = headerText || 'INVOICE'
  const invoiceTitleSize = 32
  const invoiceTitleWidth = fonts.bold.widthOfTextAtSize(invoiceTitle, invoiceTitleSize)
  page.drawText(invoiceTitle, {
    x: containerRight - invoiceTitleWidth,
    y: headerTop - 10,
    size: invoiceTitleSize,
    font: fonts.bold,
    color: mutedText,
  })

  y = Math.min(infoY, headerBaseline) - 18
  page.drawLine({
    start: {x: containerLeft, y},
    end: {x: containerRight, y},
    color: headerLineColor,
    thickness: 1,
  })
  y -= 18

  // Addresses and meta
  const billX = containerLeft
  const shipX = billX + 215
  const metaRight = containerRight
  const detailTop = y

  const billBottom = drawAddressBlock({
    page,
    fonts,
    label: 'Bill To:',
    x: billX,
    startY: detailTop,
    address: invoice.billTo ?? undefined,
    textColor,
    labelColor: headingColor,
  })

  const shippingLines = collectShippingLines(invoice, totals.shipping)

  const shipBottom = drawAddressBlock({
    page,
    fonts,
    label: 'Ship To:',
    x: shipX,
    startY: detailTop,
    address: (invoice.shipTo as InvoiceAddress) ?? invoice.billTo ?? undefined,
    textColor,
    labelColor: headingColor,
    extraLines: shippingLines,
  })

  const metaBottom = drawMetaBlock({
    page,
    fonts,
    entries: [
      {label: 'Invoice #', value: invoiceNumber},
      {label: 'Date', value: invoiceDate},
      {label: 'Due Date', value: dueDate},
    ],
    rightEdge: metaRight,
    startY: detailTop,
    textColor,
    valueColor: headingColor,
  })

  y = Math.min(billBottom, shipBottom, metaBottom) - 24

  const tableBottom = drawInvoiceTable({
    page,
    fonts,
    brand,
    startY: y,
    left: containerLeft,
    right: containerRight,
    items: Array.isArray(invoice.lineItems) ? (invoice.lineItems ?? []) : [],
    totals,
    borderColor,
    headerColor: headingColor,
    textColor,
    headerBg: tableHeaderBg,
    altRowBg: tableAltBg,
    totalsHighlight,
    taxRate: Number(invoice.taxRate || 0),
  })

  const footerLineY = Math.max(tableBottom - 30, margin + 60)
  page.drawLine({
    start: {x: containerLeft, y: footerLineY},
    end: {x: containerRight, y: footerLineY},
    color: headerLineColor,
    thickness: 1,
  })

  let footerY = footerLineY - 20
  for (const note of notes) {
    if (footerY < margin + 24) break
    page.drawText(note, {
      x: containerLeft,
      y: footerY,
      size: 10,
      font: fonts.regular,
      color: textColor,
    })
    footerY -= 14
  }
}

type AddressBlockOptions = {
  page: PDFPage
  fonts: Fonts
  label: string
  x: number
  startY: number
  address?: InvoiceAddress | null
  textColor: ReturnType<typeof rgb>
  labelColor: ReturnType<typeof rgb>
  extraLines?: string[]
}

function drawAddressBlock({
  page,
  fonts,
  label,
  x,
  startY,
  address,
  textColor,
  labelColor,
  extraLines = [],
}: AddressBlockOptions): number {
  let y = startY
  page.drawText(label, {
    x,
    y,
    size: 11,
    font: fonts.italic,
    color: labelColor,
  })
  y -= 14
  const lines = buildAddressLines(address)
  if (lines.length === 0) {
    page.drawText('—', {x, y, size: 10, font: fonts.regular, color: textColor})
    y -= 12
  } else {
    for (const line of lines) {
      page.drawText(line, {x, y, size: 10, font: fonts.regular, color: textColor})
      y -= 12
    }
  }
  if (extraLines.length) {
    if (lines.length) y -= 4
    for (const line of extraLines) {
      const content = line.trim()
      if (!content) continue
      page.drawText(content, {x, y, size: 10, font: fonts.regular, color: textColor})
      y -= 12
    }
  }
  return y
}

function collectShippingLines(invoice: InvoiceLike, shippingAmount: number): string[] {
  const lines: string[] = []
  lines.push(`Shipping: ${money(shippingAmount)}`)

  const carrier = coalesceString(
    invoice.shippingCarrier,
    (invoice as any)?.orderRef?.shippingCarrier,
    (invoice as any)?.order?.shippingCarrier,
    (invoice as any)?.orderRef?.selectedService?.carrier,
    (invoice as any)?.order?.selectedService?.carrier,
  )
  const service = coalesceString(
    (invoice as any)?.orderRef?.selectedService?.service,
    (invoice as any)?.order?.selectedService?.service,
  )
  const method = [carrier, service].filter(Boolean).join(' – ')
  if (method) lines.push(`Method: ${method}`)

  const tracking = coalesceString(
    invoice.trackingNumber,
    (invoice as any)?.orderRef?.trackingNumber,
    (invoice as any)?.order?.trackingNumber,
  )
  if (tracking) lines.push(`Tracking: ${tracking}`)

  return lines
}

type MetaBlockOptions = {
  page: PDFPage
  fonts: Fonts
  entries: Array<{label: string; value: string}>
  rightEdge: number
  startY: number
  textColor: ReturnType<typeof rgb>
  valueColor: ReturnType<typeof rgb>
}

function drawMetaBlock({
  page,
  fonts,
  entries,
  rightEdge,
  startY,
  textColor,
  valueColor,
}: MetaBlockOptions): number {
  let y = startY
  const labelSize = 10
  const valueSize = 11
  for (const entry of entries) {
    const value = entry.value && entry.value.trim() ? entry.value.trim() : '—'
    const valueWidth = fonts.bold.widthOfTextAtSize(value, valueSize)
    const valueX = rightEdge - valueWidth
    page.drawText(value, {
      x: valueX,
      y,
      size: valueSize,
      font: fonts.bold,
      color: valueColor,
    })

    const labelText = `${entry.label}:`
    const labelWidth = fonts.regular.widthOfTextAtSize(labelText, labelSize)
    const labelX = Math.min(valueX - 8 - labelWidth, rightEdge - 160)
    page.drawText(labelText, {
      x: labelX,
      y,
      size: labelSize,
      font: fonts.regular,
      color: textColor,
    })

    y -= 16
  }
  return y
}

type TableOptions = {
  page: PDFPage
  fonts: Fonts
  brand: BrandTheme
  startY: number
  left: number
  right: number
  items: InvoiceLineItem[]
  totals: InvoiceTotals
  borderColor: ReturnType<typeof rgb>
  headerColor: ReturnType<typeof rgb>
  textColor: ReturnType<typeof rgb>
  headerBg: ReturnType<typeof rgb>
  altRowBg: ReturnType<typeof rgb>
  totalsHighlight: ReturnType<typeof rgb>
  taxRate: number
}

type LineItemRow = {
  item: string
  upgrades: string
  options: string
  extras: string
  description: string
  quantity: string
  price: string
  total: string
}

type ColumnDefinition = {
  key: keyof LineItemRow
  width: number
  align: 'left' | 'right'
  title: string
}

function drawInvoiceTable({
  page,
  fonts,
  startY,
  left,
  right,
  items,
  totals,
  borderColor,
  headerColor,
  textColor,
  headerBg,
  altRowBg,
  totalsHighlight,
  taxRate,
}: TableOptions): number {
  const tableWidth = right - left
  const headerHeight = 26
  const rowHeight = 24
  const maxLineItems = 14

  const baseColumns: ColumnDefinition[] = [
    {key: 'item', width: 90, align: 'left', title: 'Item'},
    {key: 'upgrades', width: 70, align: 'left', title: 'Upgrades'},
    {key: 'options', width: 70, align: 'left', title: 'Options'},
    {key: 'extras', width: 70, align: 'left', title: 'Extras'},
    {key: 'description', width: 120, align: 'left', title: 'Description'},
    {key: 'quantity', width: 35, align: 'right', title: 'Qty'},
    {key: 'price', width: 45, align: 'right', title: 'Price'},
  ]

  let usedWidth = baseColumns.reduce((sum, column) => sum + column.width, 0)
  let remaining = tableWidth - usedWidth

  if (remaining < 60) {
    const deficit = 60 - remaining
    const descriptionIndex = baseColumns.findIndex((column) => column.key === 'description')
    if (descriptionIndex >= 0) {
      const currentWidth = baseColumns[descriptionIndex].width
      const adjustedWidth = Math.max(90, currentWidth - deficit)
      const delta = currentWidth - adjustedWidth
      baseColumns[descriptionIndex].width = adjustedWidth
      usedWidth -= delta
      remaining = tableWidth - usedWidth
    } else {
      remaining = 60
    }
  }

  const columns: ColumnDefinition[] = [
    ...baseColumns,
    {key: 'total', width: Math.max(60, remaining), align: 'right', title: 'Total'},
  ]

  const columnPositions: number[] = [left]
  for (const column of columns) {
    const prev = columnPositions[columnPositions.length - 1]
    columnPositions.push(prev + column.width)
  }

  let y = startY

  page.drawLine({
    start: {x: left, y},
    end: {x: right, y},
    color: borderColor,
    thickness: 1,
  })

  page.drawRectangle({
    x: left,
    y: y - headerHeight,
    width: tableWidth,
    height: headerHeight,
    color: headerBg,
  })

  const headerBaseline = y - 17
  columns.forEach((column, idx) => {
    drawColumnText(
      page,
      fonts.bold,
      column.title,
      headerBaseline,
      columnPositions[idx],
      columnPositions[idx + 1],
      headerColor,
      column.align,
    )
  })

  y -= headerHeight
  page.drawLine({
    start: {x: left, y},
    end: {x: right, y},
    color: borderColor,
    thickness: 1,
  })

  const normalizedItems = Array.isArray(items) ? items.filter(Boolean) : []
  const displayItems = normalizedItems.slice(0, maxLineItems)
  const remainingCount = normalizedItems.length - displayItems.length

  if (displayItems.length === 0) {
    const baseline = y - 16
    drawColumnText(
      page,
      fonts.regular,
      'No line items recorded.',
      baseline,
      columnPositions[1],
      columnPositions[columnPositions.length - 2],
      textColor,
      'left',
    )
    y -= rowHeight
    page.drawLine({
      start: {x: left, y},
      end: {x: right, y},
      color: borderColor,
      thickness: 1,
    })
  } else {
    displayItems.forEach((li, idx) => {
      const rowBottom = y - rowHeight
      if (idx % 2 === 1) {
        page.drawRectangle({
          x: left,
          y: rowBottom,
          width: tableWidth,
          height: rowHeight,
          color: altRowBg,
        })
      }
      const baseline = y - 16
      const row = resolveLineItemRow(li, idx)
      columns.forEach((column, colIdx) => {
        const value = row[column.key] ?? '—'
        drawColumnText(
          page,
          fonts.regular,
          value,
          baseline,
          columnPositions[colIdx],
          columnPositions[colIdx + 1],
          textColor,
          column.align,
        )
      })

      y = rowBottom
      page.drawLine({
        start: {x: left, y},
        end: {x: right, y},
        color: borderColor,
        thickness: 1,
      })
    })
  }

  if (remainingCount > 0) {
    const rowBottom = y - rowHeight
    const baseline = y - 16
    const summary = `+ ${remainingCount} additional item${remainingCount === 1 ? '' : 's'} not shown`
    drawColumnText(
      page,
      fonts.italic,
      summary,
      baseline,
      columnPositions[1],
      columnPositions[columnPositions.length - 2],
      textColor,
      'left',
    )
    y = rowBottom
    page.drawLine({
      start: {x: left, y},
      end: {x: right, y},
      color: borderColor,
      thickness: 1,
    })
  }

  const totalsRows: Array<{label: string; value: string; bold?: boolean}> = [
    {label: 'Subtotal', value: money(totals.subtotal)},
  ]

  if (totals.discountAmt > 0) {
    totalsRows.push({
      label: 'Discount',
      value: `-${money(totals.discountAmt).replace('-', '').replace('$-', '$')}`,
    })
  }

  const hasTax = totals.taxAmount > 0 || taxRate > 0
  if (hasTax) {
    const rateForLabel =
      Number.isFinite(taxRate) && taxRate > 0
        ? ` (${taxRate.toFixed(2).replace(/\.00$/, '')}%)`
        : ''
    totalsRows.push({label: `Tax${rateForLabel}`, value: money(totals.taxAmount)})
  }

  totalsRows.push({label: 'Shipping', value: money(totals.shipping)})
  totalsRows.push({label: 'Total Due', value: money(totals.total), bold: true})

  const totalValueStart = columnPositions[columnPositions.length - 2]
  const totalValueEnd = columnPositions[columnPositions.length - 1]

  for (const row of totalsRows) {
    const rowBottom = y - rowHeight
    if (row.bold) {
      page.drawRectangle({
        x: totalValueStart,
        y: rowBottom,
        width: totalValueEnd - totalValueStart,
        height: rowHeight,
        color: totalsHighlight,
      })
    }

    const baseline = y - 16
    const labelFont = row.bold ? fonts.bold : fonts.regular
    const valueFont = row.bold ? fonts.bold : fonts.regular

    drawColumnText(
      page,
      labelFont,
      row.label,
      baseline,
      columnPositions[0],
      totalValueStart,
      headerColor,
      'right',
    )
    drawColumnText(
      page,
      valueFont,
      row.value,
      baseline,
      totalValueStart,
      totalValueEnd,
      headerColor,
      'right',
    )

    y = rowBottom
    page.drawLine({
      start: {x: left, y},
      end: {x: right, y},
      color: borderColor,
      thickness: 1,
    })
  }

  for (const xPos of columnPositions) {
    page.drawLine({
      start: {x: xPos, y: startY},
      end: {x: xPos, y},
      color: borderColor,
      thickness: 1,
    })
  }

  return y
}

const EXTRA_SKIP_KEYWORDS = [
  'option',
  'upgrade',
  'addon',
  'add-on',
  'add_on',
  'shipping',
  'tax',
  'subtotal',
  'total',
  'price',
  'amount',
  'sku',
  'quantity',
  'qty',
  'product',
  'name',
  'description',
]

function resolveLineItemRow(item: InvoiceLineItem, index: number): LineItemRow {
  const itemName = resolveItemName(item, index)
  const upgradesList = mergeUniqueStrings(
    toStringArray((item as any)?.upgrades),
    toStringArray((item as any)?.upgradeOptions),
  )

  const optionSummary = normalizeString((item as any)?.optionSummary)
  const validationIssuesList = mergeUniqueStrings(toStringArray((item as any)?.validationIssues))

  const optionDetails = mergeUniqueStrings(
    toStringArray((item as any)?.optionDetails),
    optionSummary ? [optionSummary] : [],
    validationIssuesList.map((issue) => `⚠️ ${issue}`),
  )

  const rawMetadataEntries = Array.isArray((item as any)?.metadataEntries)
    ? ((item as any)?.metadataEntries as Array<{key?: string | null; value?: unknown}>)
    : Array.isArray((item as any)?.metadata)
      ? ((item as any)?.metadata as Array<{key?: string | null; value?: unknown}>)
      : undefined

  const extrasList = collectMetadataExtras(rawMetadataEntries, [...upgradesList, ...optionDetails])

  const description = resolveDescription(item)
  const quantity = formatQuantity(item.quantity) || '—'
  const unitPrice = resolveUnitPrice(item)
  const lineTotal = resolveLineTotal(item)
  const skuValue = normalizeString(item.sku || (item as any)?.itemCode)
  if (skuValue && !itemName.toLowerCase().includes(skuValue.toLowerCase())) {
    const hasSku = extrasList.some((entry) => entry.toLowerCase().includes(skuValue.toLowerCase()))
    if (!hasSku) {
      extrasList.push(`SKU: ${skuValue}`)
    }
  }

  return {
    item: itemName,
    upgrades: upgradesList.join(', ') || '—',
    options: optionDetails.join(', ') || '—',
    extras: extrasList.join(', ') || '—',
    description: description || '—',
    quantity,
    price: unitPrice,
    total: lineTotal,
  }
}

function collectMetadataExtras(
  metadata: Array<{key?: string | null; value?: unknown}> | null | undefined,
  excludeValues: string[] = [],
): string[] {
  if (!Array.isArray(metadata) || metadata.length === 0) return []
  const extras: string[] = []
  const seen = new Set<string>()
  const excludeSet = new Set(excludeValues.map((value) => value.toLowerCase()))

  for (const entry of metadata) {
    if (!entry) continue
    const keyRaw = typeof entry.key === 'string' ? entry.key : ''
    const value = normalizeString(toStringValue(entry.value))
    if (!value) continue
    if (excludeSet.has(value.toLowerCase())) continue

    const lowerKey = keyRaw.toLowerCase()
    if (lowerKey && EXTRA_SKIP_KEYWORDS.some((keyword) => lowerKey.includes(keyword))) continue

    const label = humanizeKey(keyRaw)
    const combined = label ? `${label}: ${value}` : value
    const signature = combined.toLowerCase()
    if (seen.has(signature)) continue
    seen.add(signature)
    extras.push(combined)
  }

  return extras
}

function humanizeKey(text: string): string {
  if (!text) return ''
  return text
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, (_, a: string, b: string) => `${a} ${b}`)
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function drawColumnText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  baseline: number,
  columnStart: number,
  columnEnd: number,
  color: ReturnType<typeof rgb>,
  align: 'left' | 'right',
) {
  const size = 10
  const content = text?.trim?.() ? text.trim() : '—'
  const maxWidth = columnEnd - columnStart - 8
  const width = font.widthOfTextAtSize(content, size)
  const clipped = width > maxWidth ? clipText(content, font, size, maxWidth) : content
  const textWidth = font.widthOfTextAtSize(clipped, size)
  const x =
    align === 'right' ? columnEnd - 4 - textWidth : Math.max(columnStart + 4, columnEnd - maxWidth)
  page.drawText(clipped, {
    x,
    y: baseline,
    size,
    font,
    color,
  })
}

function clipText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  const ellipsis = '…'
  let result = ''
  for (const char of text) {
    const next = result + char
    if (font.widthOfTextAtSize(next + ellipsis, size) > maxWidth) break
    result = next
  }
  return result ? result + ellipsis : ellipsis
}

function resolveItemName(item: InvoiceLineItem, index: number): string {
  const candidates = [
    (item as any)?.name,
    item.productName,
    item.description,
    item.itemName,
    item.itemCode,
    item.sku,
  ]
  for (const candidate of candidates) {
    const normalized = normalizeString(candidate)
    if (normalized) return normalized
  }
  return `Item ${index + 1}`
}

function resolveDescription(item: InvoiceLineItem): string {
  const explicit = normalizeString(item.description)
  if (explicit) return explicit

  const productName = normalizeString((item as any)?.productName)
  if (productName) return productName

  const fallback = normalizeString((item as any)?.name)
  if (fallback) return fallback

  const optionSummary = normalizeString((item as any)?.optionSummary)
  if (optionSummary) return optionSummary

  return ''
}

function formatQuantity(quantity: number | null | undefined): string {
  if (quantity === null || quantity === undefined) return ''
  const numeric = Number(quantity)
  if (!Number.isFinite(numeric)) return ''
  return numeric % 1 === 0 ? String(numeric) : numeric.toFixed(2)
}

function resolveUnitPrice(item: InvoiceLineItem): string {
  const value = Number(item.unitPrice ?? (item as any)?.amount ?? (item as any)?.price ?? 0)
  if (!Number.isFinite(value)) return money(0)
  return money(value)
}

function resolveLineTotal(item: InvoiceLineItem): string {
  const totalCandidate =
    typeof item.lineTotal === 'number' && Number.isFinite(item.lineTotal)
      ? item.lineTotal
      : typeof (item as any)?.total === 'number' && Number.isFinite((item as any)?.total)
        ? (item as any)?.total
        : undefined

  if (typeof totalCandidate === 'number') {
    return money(totalCandidate)
  }
  const qty = Number(item.quantity ?? 1)
  const unit = Number(item.unitPrice ?? (item as any)?.amount ?? (item as any)?.price ?? 0)
  const total = Number.isFinite(qty) && Number.isFinite(unit) ? qty * unit : 0
  return money(total)
}

function collectNotes(
  invoice: InvoiceLike | null | undefined,
  includePaymentTerms = true,
): string[] {
  const custom = typeof invoice?.customerNotes === 'string' ? (invoice!.customerNotes as string) : ''
  if (custom.trim()) {
    return custom
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  }
  const terms = typeof invoice?.terms === 'string' ? (invoice!.terms as string) : ''
  if (includePaymentTerms && terms.trim()) {
    return terms
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  }
  return []
}

async function loadLogo(
  pdf: PDFDocument,
  logoPath: string,
  logoUrl?: string,
): Promise<PDFImage | null> {
  const embedData = async (data: Uint8Array | ArrayBuffer) => {
    try {
      return await pdf.embedPng(data)
    } catch {
      try {
        return await pdf.embedJpg(data)
      } catch {
        return null
      }
    }
  }

  if (logoUrl) {
    try {
      const response = await fetch(logoUrl)
      if (response.ok) {
        const buffer = await response.arrayBuffer()
        const embedded = await embedData(buffer)
        if (embedded) return embedded
      }
    } catch (err) {
      console.warn('renderInvoicePdf: failed to fetch logo', err)
    }
  }

  try {
    if (logoPath && fs.existsSync(logoPath)) {
      const bytes = fs.readFileSync(logoPath)
      const embedded = await embedData(bytes)
      if (embedded) return embedded
    }
  } catch (err) {
    console.warn('renderInvoicePdf: failed to load logo', err)
  }

  return null
}

function buildAddressLines(address?: InvoiceAddress | null): string[] {
  if (!address) return []
  const lines: string[] = []
  const name = normalizeString(address.name)
  const company = normalizeString(address.company)
  if (name) lines.push(name)
  if (company && company !== name) lines.push(company)

  const streetParts = [address.address_line1, address.address_line2]
    .map(normalizeString)
    .filter(Boolean)
  if (streetParts.length) lines.push(streetParts.join(', '))

  const cityParts = [address.city_locality, address.state_province]
    .map(normalizeString)
    .filter(Boolean)
  let cityLine = ''
  if (cityParts.length) cityLine = cityParts.join(', ')
  const postal = normalizeString(address.postal_code)
  if (postal) cityLine = cityLine ? `${cityLine} ${postal}` : postal
  const country = normalizeString(address.country || address.country_code)
  if (cityLine) lines.push(cityLine)
  if (country) lines.push(country)

  const phone = normalizeString(address.phone)
  if (phone) lines.push(`Phone: ${phone}`)
  const email = normalizeString(address.email)
  if (email) lines.push(`Email: ${email}`)

  return Array.from(new Set(lines.filter((line) => line && line.trim().length > 0)))
}

function normalizeString(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function normalizeDate(value: string | null | undefined): string {
  const str = normalizeString(value)
  if (!str) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  const parsed = new Date(str)
  if (!Number.isFinite(parsed.getTime())) return str
  return parsed.toISOString().slice(0, 10)
}
