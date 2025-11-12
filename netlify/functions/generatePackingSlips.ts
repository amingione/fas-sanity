import {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {PDFDocument, StandardFonts, rgb} from 'pdf-lib'
import imageUrlBuilder from '@sanity/image-url'
import {fetchPrintSettings, PrintSettings} from '../lib/printSettings'
import {
  coerceStringArray,
  deriveOptionsFromMetadata as deriveCartOptions,
  normalizeMetadataEntries,
  shouldDisplayMetadataSegment,
  uniqueStrings,
} from '@fas/sanity-config/utils/cartItemDetails'
import type {NormalizedMetadataEntry} from '@fas/sanity-config/utils/cartItemDetails'

const DEFAULT_ORIGINS = (
  process.env.CORS_ALLOW || 'http://localhost:3333,http://localhost:8888'
).split(',')

function pickOrigin(origin?: string): string {
  if (!origin) return DEFAULT_ORIGINS[0]
  if (DEFAULT_ORIGINS.includes(origin)) return origin
  if (/^http:\/\/localhost:\d+$/i.test(origin)) return origin
  return DEFAULT_ORIGINS[0]
}

const CORS_HEADERS = (origin?: string) => ({
  'Access-Control-Allow-Origin': pickOrigin(origin),
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
})

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

// Image URL builder for Sanity images
const builder = imageUrlBuilder(sanity)

// Fallback constants (used if print settings not configured)
const LOGO_URL = process.env.PACKING_SLIP_LOGO_URL || 'https://fassite.netlify.app/logo.png'
const SHOP_NAME =
  process.env.PACKING_SLIP_SHOP_NAME || process.env.SHIP_FROM_NAME || 'F.A.S. Motorsports'
const SHOP_EMAIL =
  process.env.PACKING_SLIP_SHOP_EMAIL || process.env.SHIP_FROM_EMAIL || 'orders@fasmotorsports.com'
const SHOP_DOMAIN = (process.env.PACKING_SLIP_SHOP_DOMAIN || 'www.fasmotorsports.com')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '')
const SHOP_ADDRESS = [
  process.env.SHIP_FROM_ADDRESS1,
  process.env.SHIP_FROM_CITY,
  process.env.SHIP_FROM_STATE,
  process.env.SHIP_FROM_POSTAL_CODE,
  process.env.SHIP_FROM_COUNTRY,
]
  .filter(Boolean)
  .join(', ')

interface NormalizedAddress {
  name?: string
  company?: string
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  email?: string
  phone?: string
}

interface PackingItem {
  title: string
  details?: string
  quantity: number
}

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/[$,]/g, '')
    if (!trimmed) return undefined
    const parsed = Number.parseFloat(trimmed)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

const formatCurrency = (value: unknown, currency = 'USD'): string | undefined => {
  const num = toNumber(value)
  if (typeof num !== 'number') return undefined
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  } catch {
    return `$${num.toFixed(2)}`
  }
}

const metadataEntriesToMap = (entries: NormalizedMetadataEntry[]): Record<string, string> => {
  return entries.reduce<Record<string, string>>((acc, entry) => {
    if (!entry?.key) return acc
    const key = entry.key.toLowerCase()
    if (!acc[key]) acc[key] = entry.value
    return acc
  }, {})
}

const getMetaValue = (
  metaMap: Record<string, string>,
  ...keys: Array<string | string[]>
): string | undefined => {
  for (const key of keys.flat()) {
    const lookup = metaMap[key.toLowerCase()]
    if (lookup) return lookup
  }
  return undefined
}

const normalizeSkuCandidate = (value?: string | null): string | undefined => {
  if (!value) return undefined
  const trimmed = value.toString().trim()
  if (!trimmed || /^price_/i.test(trimmed)) return undefined
  return trimmed
}

interface PackingData {
  orderNumber: string
  orderDate: string
  customerName: string
  shippingAddress: string[]
  billingAddress: string[]
  items: PackingItem[]
  notes?: string
}

function cleanIdentifier(value?: string | null): string {
  if (!value) return ''
  return String(value)
    .replace(/^drafts\./, '')
    .trim()
}

function normalizeAddress(raw: any | null | undefined): NormalizedAddress | null {
  if (!raw || typeof raw !== 'object') return null
  return {
    name: raw.name || raw.fullName || raw.firstName || undefined,
    company: raw.company || undefined,
    line1: raw.addressLine1 || raw.address_line1 || undefined,
    line2: raw.addressLine2 || raw.address_line2 || undefined,
    city: raw.city || raw.city_locality || undefined,
    state: raw.state || raw.state_province || undefined,
    postalCode: raw.postalCode || raw.postal_code || undefined,
    country: raw.country || raw.country_code || undefined,
    email: raw.email || undefined,
    phone: raw.phone || undefined,
  }
}

function addressLines(address: NormalizedAddress | null): string[] {
  if (!address) return ['No address available']
  const lines: string[] = []
  if (address.name) lines.push(address.name)
  if (address.company) lines.push(address.company)
  if (address.line1) lines.push(address.line1)
  if (address.line2) lines.push(address.line2)
  const cityBits = [
    address.city,
    [address.state, address.postalCode].filter(Boolean).join(' '),
  ].filter(Boolean)
  if (cityBits.length) lines.push(cityBits.join(', '))
  if (address.country) lines.push(address.country)
  if (address.email) lines.push(address.email)
  if (address.phone) lines.push(address.phone)
  return lines.length ? lines : ['No address available']
}

function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  const sanitized = text.replace(/\s+/g, ' ').trim()
  if (!sanitized) return ['']
  const words = sanitized.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    const width = font.widthOfTextAtSize(candidate, fontSize)
    if (width <= maxWidth) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

const canonicalDetailKey = (input: string): string | null => {
  const trimmed = input.trim()
  if (!trimmed) return null
  const [rawLabel, ...rest] = trimmed.split(':')
  if (rest.length === 0) return trimmed.toLowerCase()
  const value = rest.join(':').trim().toLowerCase()
  let label = rawLabel.toLowerCase()
  label = label.replace(
    /\b(option|selected|selection|value|display|name|field|attribute|choice|custom)\b/g,
    '',
  )
  label = label.replace(/[^a-z0-9]+/g, ' ').trim()
  if (label && label === value) return null
  if (!label) return value ? `value:${value}` : trimmed.toLowerCase()
  return `label:${label}|value:${value}`
}

const buildDetailList = (opts: {
  summary?: string | null
  optionDetails?: string[]
  upgrades?: string[]
  customizations?: string[]
  validationIssues?: string[]
}): string[] => {
  const details: string[] = []
  const seen = new Set<string>()
  const addDetail = (text: string) => {
    if (!text) return
    if (!shouldDisplayMetadataSegment(text)) return
    const key = canonicalDetailKey(text)
    if (!key) return
    if (seen.has(key)) return
    seen.add(key)
    details.push(text)
  }

  if (opts.summary) {
    opts.summary
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach(addDetail)
  }

  if (opts.optionDetails?.length) {
    uniqueStrings(opts.optionDetails).forEach((detail) => {
      detail
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach(addDetail)
    })
  }

  if (opts.upgrades?.length) {
    const upgrades = uniqueStrings(opts.upgrades)
    if (upgrades.length) addDetail(`Upgrades: ${upgrades.join(', ')}`)
  }

  if (opts.customizations?.length) {
    uniqueStrings(opts.customizations).forEach(addDetail)
  }

  if (opts.validationIssues?.length) {
    uniqueStrings(opts.validationIssues)
      .map((issue) => issue.trim())
      .filter(Boolean)
      .forEach((issue) => addDetail(`⚠️ ${issue}`))
  }

  return details
}

const prepareItemPresentation = (source: {
  name?: unknown
  productName?: unknown
  description?: unknown
  title?: unknown
  sku?: unknown
  productSku?: unknown
  price?: unknown
  currency?: string
  optionSummary?: unknown
  optionDetails?: unknown
  upgrades?: unknown
  customizations?: unknown
  metadataEntries?: unknown
  metadata?: unknown
}): {title: string; details: string[]} => {
  const metadataEntries = normalizeMetadataEntries(
    (source.metadataEntries ?? source.metadata) as any,
  )
  const derived = deriveCartOptions(metadataEntries)
  const rawName = (
    source?.name ||
    source?.description ||
    source?.productName ||
    source?.title ||
    source?.sku ||
    'Item'
  ).toString()
  const nameSegments = rawName
    .split('•')
    .map((segment) => segment.trim())
    .filter(Boolean)
  const title = nameSegments[0] || rawName
  const summary =
    (source.optionSummary || derived.optionSummary || '').toString().trim() || undefined
  const optionDetails = uniqueStrings([
    ...coerceStringArray(source.optionDetails),
    ...derived.optionDetails,
  ])
  const upgrades = uniqueStrings([...coerceStringArray(source.upgrades), ...derived.upgrades])
  const customizations = uniqueStrings([
    ...coerceStringArray(source.customizations),
    ...derived.customizations,
  ])
  const details = buildDetailList({
    summary,
    optionDetails,
    upgrades,
    customizations,
    validationIssues: coerceStringArray((source as any).validationIssues),
  })
  const detailSet = new Set(details.map((detail) => detail.toLowerCase()))
  const appendDetail = (detail?: string) => {
    if (!detail) return
    const normalized = detail.toLowerCase()
    if (detailSet.has(normalized)) return
    detailSet.add(normalized)
    details.push(detail)
  }
  if (nameSegments.length > 1) {
    for (const segment of nameSegments.slice(1)) {
      const normalized = segment.replace(/\s+/g, ' ').trim()
      if (!normalized) continue
      if (!shouldDisplayMetadataSegment(normalized)) continue
      appendDetail(normalized)
    }
  }
  const rawSkuCandidates = [source?.sku, source?.productSku].map((candidate) =>
    typeof candidate === 'string' ? candidate.trim() : undefined,
  )
  const resolvedSku = rawSkuCandidates.find((candidate) => candidate && !/^price_/i.test(candidate))
  if (resolvedSku) appendDetail(`SKU: ${resolvedSku}`)
  const formattedPrice = formatCurrency(source.price, source.currency)
  if (formattedPrice) appendDetail(`Price: ${formattedPrice}`)
  return {title, details}
}

async function buildPdf(data: PackingData, settings: PrintSettings | null): Promise<Uint8Array> {
  // Apply settings or use defaults
  const pageSize = settings?.layout?.pageSize || 'letter'
  const pageDimensions = pageSize === 'a4' ? [595.28, 841.89] : [612, 792] // A4 or Letter
  const marginInches = {
    top: settings?.layout?.margins?.top || 0.67,
    right: settings?.layout?.margins?.right || 0.67,
    bottom: settings?.layout?.margins?.bottom || 0.67,
    left: settings?.layout?.margins?.left || 0.67,
  }
  const margin = marginInches.left * 72 // Convert inches to points

  const pdfDoc = await PDFDocument.create()
  let page = pdfDoc.addPage(pageDimensions as [number, number])
  let {width, height} = page.getSize()

  const baseFontSize = settings?.typography?.fontSize || 11
  const bodyFontSize = baseFontSize
  const smallFontSize = baseFontSize - 1
  const lineGap = 16

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // Parse colors from settings
  const primaryColorHex = settings?.primaryColor?.hex || '#000000'
  const textColorHex = settings?.textColor?.hex || '#000000'
  const parseHex = (hex: string) => {
    const clean = hex.replace('#', '')
    const r = parseInt(clean.substring(0, 2), 16) / 255
    const g = parseInt(clean.substring(2, 4), 16) / 255
    const b = parseInt(clean.substring(4, 6), 16) / 255
    return rgb(r, g, b)
  }
  const primaryRgb = parseHex(primaryColorHex)
  const textRgb = parseHex(textColorHex)

  let y = height - marginInches.top * 72

  // Company info from settings
  const companyName = settings?.companyName || SHOP_NAME
  const companyEmail = settings?.companyEmail || SHOP_EMAIL
  const companyWebsite =
    settings?.companyWebsite?.replace(/^https?:\/\//, '').replace(/\/$/, '') || SHOP_DOMAIN
  const companyAddress = settings?.companyAddress || SHOP_ADDRESS
  const headerText = settings?.packingSlipSettings?.headerText || 'PACKING SLIP'
  const showLogo = settings?.packingSlipSettings?.showLogo !== false
  const includeNotes = settings?.packingSlipSettings?.includeNotes !== false

  // Logo handling
  if (showLogo) {
    let logoUrl = LOGO_URL

    // Use Sanity logo if available
    if (settings?.logo) {
      try {
        logoUrl = builder.image(settings.logo).width(400).url()
      } catch (err) {
        console.warn('Failed to build logo URL from settings:', err)
      }
    }

    if (logoUrl) {
      try {
        const res = await fetch(logoUrl)
        if ((res as any)?.ok) {
          const buffer = await (res as any).arrayBuffer()
          try {
            const img = await pdfDoc.embedPng(buffer)
            const scaled = img.scale(0.4)
            page.drawImage(img, {
              x: margin,
              y: y - scaled.height,
              width: scaled.width,
              height: scaled.height,
            })
            y -= scaled.height + 12
          } catch {
            try {
              const img = await pdfDoc.embedJpg(buffer)
              const scaled = img.scale(0.4)
              page.drawImage(img, {
                x: margin,
                y: y - scaled.height,
                width: scaled.width,
                height: scaled.height,
              })
              y -= scaled.height + 12
            } catch {
              // ignore image failures
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // Header
  const headerTop = y
  page.drawText(companyName.toUpperCase(), {
    x: margin,
    y: headerTop,
    font: helveticaBold,
    size: 20,
    color: primaryRgb,
  })

  const orderNumberLabel = data.orderNumber ? `${headerText} #${data.orderNumber}` : headerText
  const orderLabelY = headerTop - 22
  if (orderNumberLabel) {
    page.drawText(orderNumberLabel, {
      x: margin,
      y: orderLabelY,
      font: helveticaBold,
      size: 13,
      color: textRgb,
    })
  }

  const orderMeta: string[] = [data.orderDate, data.customerName].filter(Boolean)
  orderMeta.forEach((line, idx) => {
    const fontToUse = helvetica
    const size = idx === 0 ? 12 : 11
    const textWidth = fontToUse.widthOfTextAtSize(line, size)
    page.drawText(line, {
      x: width - margin - textWidth,
      y: headerTop - idx * 14,
      font: fontToUse,
      size,
      color: textRgb,
    })
  })

  const leftBottom = orderNumberLabel ? orderLabelY - 20 : headerTop - 28
  const rightBottom = orderMeta.length ? headerTop - orderMeta.length * 14 - 18 : headerTop - 28
  y = Math.min(leftBottom, rightBottom) - 4

  // Addresses
  const columnGap = 32
  const columnWidth = (width - margin * 2 - columnGap) / 2

  function drawAddress(title: string, lines: string[], x: number): number {
    let localY = y
    page.drawText(title.toUpperCase(), {
      x,
      y: localY,
      font: helveticaBold,
      size: bodyFontSize,
      color: primaryRgb,
    })
    localY -= lineGap
    for (const rawLine of lines) {
      const wrapped = wrapText(rawLine, columnWidth, helvetica, smallFontSize)
      for (const w of wrapped) {
        page.drawText(w, {x, y: localY, font: helvetica, size: smallFontSize, color: textRgb})
        localY -= lineGap
      }
    }
    return localY
  }

  const shipBottom = drawAddress('Ship to', data.shippingAddress, margin)
  const billBottom = drawAddress('Bill to', data.billingAddress, margin + columnWidth + columnGap)

  y = Math.min(shipBottom, billBottom) - 10

  // Separator
  page.drawRectangle({x: margin, y, width: width - margin * 2, height: 1, color: primaryRgb})
  y -= 18

  // Items header
  page.drawText('Items'.toUpperCase(), {
    x: margin,
    y,
    font: helveticaBold,
    size: bodyFontSize,
    color: primaryRgb,
  })
  const qtyColumnWidth = 120
  const getQtyX = () => width - margin - qtyColumnWidth + 30
  page.drawText('Quantity'.toUpperCase(), {
    x: getQtyX(),
    y,
    font: helveticaBold,
    size: bodyFontSize,
    color: primaryRgb,
  })
  y -= lineGap

  const getDescWidth = () => width - margin * 2 - qtyColumnWidth - 20

  function ensureSpace(required: number) {
    if (y - required < margin) {
      page = pdfDoc.addPage(pageDimensions as [number, number])
      ;({width, height} = page.getSize())
      y = height - marginInches.top * 72
      page.drawText('Items'.toUpperCase(), {
        x: margin,
        y,
        font: helveticaBold,
        size: bodyFontSize,
        color: primaryRgb,
      })
      page.drawText('Quantity'.toUpperCase(), {
        x: getQtyX(),
        y,
        font: helveticaBold,
        size: bodyFontSize,
        color: primaryRgb,
      })
      y -= lineGap
    }
  }

  for (const item of data.items) {
    const descWidth = getDescWidth()
    const primaryLines = wrapText(item.title, descWidth, helveticaBold, bodyFontSize)
    const detailLines = item.details
      ? wrapText(item.details, descWidth, helvetica, smallFontSize)
      : []
    const totalLines = primaryLines.length + detailLines.length
    const rowHeight = totalLines * lineGap + 4
    ensureSpace(rowHeight)

    let rowY = y
    primaryLines.forEach((line, idx) => {
      page.drawText(line, {
        x: margin,
        y: rowY,
        font: helveticaBold,
        size: bodyFontSize,
        color: textRgb,
      })
      rowY -= lineGap
    })
    detailLines.forEach((line) => {
      page.drawText(line, {
        x: margin,
        y: rowY,
        font: helvetica,
        size: smallFontSize,
        color: textRgb,
      })
      rowY -= lineGap
    })

    const qtyText = item.quantity > 0 ? `${item.quantity}` : '—'
    page.drawText(qtyText, {
      x: getQtyX(),
      y: y,
      font: helvetica,
      size: bodyFontSize,
      color: textRgb,
    })

    y -= rowHeight
  }

  if (includeNotes && data.notes) {
    y -= 4
    page.drawRectangle({
      x: margin,
      y,
      width: width - margin * 2,
      height: 1,
      color: rgb(0.6, 0.6, 0.6),
    })
    y -= lineGap
    page.drawText('Notes'.toUpperCase(), {
      x: margin,
      y,
      font: helveticaBold,
      size: bodyFontSize,
      color: primaryRgb,
    })
    y -= lineGap
    const wrappedNotes = wrapText(data.notes, width - margin * 2, helvetica, smallFontSize)
    wrappedNotes.forEach((line) => {
      page.drawText(line, {x: margin, y, font: helvetica, size: smallFontSize, color: textRgb})
      y -= lineGap
    })
  }

  y -= lineGap
  page.drawRectangle({x: margin, y, width: width - margin * 2, height: 1, color: primaryRgb})
  y -= lineGap

  const footerLines = [
    'Thank you for shopping with us!',
    companyName,
    companyAddress,
    companyEmail,
    companyWebsite,
  ].filter(Boolean)

  footerLines.forEach((line) => {
    page.drawText(line, {
      x: margin,
      y,
      font: helvetica,
      size: smallFontSize,
      color: rgb(0.4, 0.4, 0.4),
    })
    y -= lineGap
  })

  return pdfDoc.save({useObjectStreams: false})
}

async function fetchPackingData(invoiceId?: string, orderId?: string): Promise<PackingData | null> {
  const cleanInvoiceId = invoiceId?.replace(/^drafts\./, '')
  const cleanOrderId = orderId?.replace(/^drafts\./, '')

  let invoice: any = null
  let order: any = null

  if (cleanInvoiceId) {
    invoice = await sanity.fetch(
      `*[_type == "invoice" && _id == $id][0]{
        _id,
        _createdAt,
        invoiceNumber,
        orderNumber,
        invoiceDate,
        customerEmail,
        customerNotes,
        internalNotes,
        billTo,
        shipTo,
        lineItems[]{
          quantity,
          description,
          sku,
          kind,
          product->{ title, sku },
          unitPrice,
          metadata[]{key, value}
        },
        orderRef->{
          _id,
          orderNumber,
          createdAt,
          stripeSessionId,
          customerEmail,
          shippingAddress,
          cart[]{
            name,
            sku,
            quantity,
            price,
            lineTotal,
            total,
            optionSummary,
            optionDetails,
            upgrades,
            customizations,
            validationIssues,
            productRef->{ _id, title, slug },
            metadata[]{key, value}
          },
        }
      }`,
      {id: cleanInvoiceId},
    )
    if (invoice?.orderRef && typeof invoice.orderRef === 'object') {
      order = invoice.orderRef
    }
  }

  if (!order && cleanOrderId) {
    order = await sanity.fetch(
      `*[_type == "order" && _id == $id][0]{
        _id,
        orderNumber,
        createdAt,
        stripeSessionId,
        customerEmail,
        shippingAddress,
        billingAddress,
        cart[]{
          name,
          sku,
          quantity,
          price,
          lineTotal,
          total,
          optionSummary,
          optionDetails,
          upgrades,
          customizations,
          validationIssues,
          productRef->{ _id, title, slug },
          metadata[]{key, value}
        },
        notes,
        invoiceRef
      }`,
      {id: cleanOrderId},
    )
  }

  if (!invoice && order?.invoiceRef?._ref) {
    invoice = await sanity.fetch(
      `*[_type == "invoice" && _id == $id][0]{
        _id,
        _createdAt,
        invoiceNumber,
        orderNumber,
        invoiceDate,
        customerEmail,
        customerNotes,
        internalNotes,
        billTo,
        shipTo,
        lineItems[]{
          quantity,
          description,
          sku,
          kind,
          product->{ title, sku },
          unitPrice,
          optionSummary,
          optionDetails,
          upgrades,
          customizations,
          metadata[]{key, value}
        }
      }`,
      {id: order.invoiceRef._ref},
    )
  }

  if (!invoice && !order) return null

  const collectProductIds = (...collections: Array<any[] | undefined | null>): string[] => {
    const ids = new Set<string>()
    for (const collection of collections) {
      if (!Array.isArray(collection)) continue
      for (const item of collection) {
        const entries = normalizeMetadataEntries(
          (item?.metadataEntries ?? item?.metadata) as any,
        )
        const metaMap = metadataEntriesToMap(entries)
        const candidate =
          getMetaValue(metaMap, 'sanity_product_id', 'product_id', 'productid') ||
          (item?.product?._id ? String(item.product._id) : undefined)
        const normalized = candidate ? cleanIdentifier(candidate) : ''
        if (normalized) ids.add(normalized)
      }
    }
    return Array.from(ids)
  }

  const productIds = collectProductIds(order?.cart, invoice?.lineItems)
  let productLookup: Record<string, {sku?: string | null}> = {}
  if (productIds.length > 0) {
    const products: Array<{_id: string; sku?: string | null}> = await sanity.fetch(
      `*[_type == "product" && _id in $ids]{ _id, sku }`,
      {ids: productIds},
    )
    productLookup = products.reduce<Record<string, {sku?: string | null}>>((acc, product) => {
      const key = cleanIdentifier(product._id)
      if (key) acc[key] = {sku: product.sku || undefined}
      return acc
    }, {})
  }

  const shippingAddress = normalizeAddress(invoice?.shipTo || order?.shippingAddress)
  const billingAddress = normalizeAddress(
    invoice?.billTo || order?.billingAddress || shippingAddress,
  )

  const invoiceNumber = cleanIdentifier(invoice?.invoiceNumber || invoice?.orderNumber)
  const primaryOrderNumber = cleanIdentifier(order?.orderNumber)
  const orderInvoiceRefId =
    order && typeof order.invoiceRef === 'object' && order.invoiceRef
      ? cleanIdentifier((order.invoiceRef as any)._ref)
      : ''
  const fallbackId =
    cleanIdentifier(order?._id) ||
    cleanIdentifier(cleanOrderId) ||
    orderInvoiceRefId ||
    cleanIdentifier(cleanInvoiceId)
  const orderNumber = invoiceNumber || primaryOrderNumber || fallbackId || ''
  const dateSource = invoice?.invoiceDate || order?.createdAt || invoice?._createdAt
  const orderDate = dateSource
    ? new Date(dateSource).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : ''
  const customerName =
    shippingAddress?.name ||
    billingAddress?.name ||
    invoice?.customerEmail ||
    order?.customerEmail ||
    'Customer'

  const items: PackingItem[] = []
  if (Array.isArray(order?.cart) && order.cart.length > 0) {
    for (const ci of order.cart) {
      if (!ci) continue
      const metadataEntries = normalizeMetadataEntries(
        (ci.metadataEntries ?? ci.metadata) as any,
      )
      const metaMap = metadataEntriesToMap(metadataEntries)
      const productId = getMetaValue(metaMap, 'sanity_product_id', 'product_id')
      const lookupSku = productId ? productLookup[cleanIdentifier(productId)]?.sku : undefined
      const baseSku = typeof ci.sku === 'string' ? ci.sku.trim() : undefined
      const resolvedSku =
        normalizeSkuCandidate(baseSku) ||
        normalizeSkuCandidate(getMetaValue(metaMap, 'sanity_sku', 'product_sku', 'sku')) ||
        normalizeSkuCandidate(lookupSku) ||
        baseSku
      const unitPrice =
        toNumber(ci.price) ||
        toNumber(getMetaValue(metaMap, 'unit_price')) ||
        toNumber(getMetaValue(metaMap, 'base_price'))
      const currency = getMetaValue(metaMap, 'currency') || 'USD'
      const presentation = prepareItemPresentation({
        name: ci.name,
        productName: ci.productName,
        sku: resolvedSku,
        price: unitPrice,
        currency,
        optionSummary: ci.optionSummary,
        optionDetails: ci.optionDetails,
        upgrades: ci.upgrades,
        customizations: ci.customizations,
        metadataEntries: ci.metadataEntries,
      })
      const quantity = Number(ci.quantity || 1)
      items.push({
        title: presentation.title,
        details: presentation.details.length ? presentation.details.join(' • ') : undefined,
        quantity,
      })
    }
  } else if (Array.isArray(invoice?.lineItems) && invoice.lineItems.length > 0) {
    for (const li of invoice.lineItems) {
      const quantity = Number(li?.quantity || 1)
      const metadataEntries = normalizeMetadataEntries(
        ((li as any)?.metadataEntries ?? (li as any)?.metadata) as any,
      )
      const metaMap = metadataEntriesToMap(metadataEntries)
      const productId =
        getMetaValue(metaMap, 'sanity_product_id', 'product_id') ||
        (li?.product?._id ? String(li.product._id) : undefined)
      const lookupSku = productId ? productLookup[cleanIdentifier(productId)]?.sku : undefined
      const baseSku = typeof li?.sku === 'string' ? String(li.sku).trim() : undefined
      const resolvedSku =
        normalizeSkuCandidate(baseSku) ||
        normalizeSkuCandidate(getMetaValue(metaMap, 'sanity_sku', 'product_sku', 'sku')) ||
        normalizeSkuCandidate(lookupSku) ||
        baseSku
      const unitPrice =
        toNumber(li?.unitPrice) ||
        toNumber(getMetaValue(metaMap, 'unit_price')) ||
        toNumber(getMetaValue(metaMap, 'base_price'))
      const currency = getMetaValue(metaMap, 'currency') || 'USD'
      const presentation = prepareItemPresentation({
        name: li?.description,
        productName: li?.product?.title,
        sku: resolvedSku,
        price: unitPrice,
        currency,
        optionSummary: (li as any)?.optionSummary,
        optionDetails: (li as any)?.optionDetails,
        upgrades: (li as any)?.upgrades,
        customizations: (li as any)?.customizations,
        metadataEntries: (li as any)?.metadataEntries,
      })
      items.push({
        title: presentation.title,
        details: presentation.details.length ? presentation.details.join(' • ') : undefined,
        quantity,
      })
    }
  }

  if (items.length === 0) {
    items.push({title: 'No items found', quantity: 0})
  }

  const notes = invoice?.customerNotes || invoice?.internalNotes || order?.notes || undefined

  return {
    orderNumber,
    orderDate,
    customerName,
    shippingAddress: addressLines(shippingAddress),
    billingAddress: addressLines(billingAddress),
    items,
    notes,
  }
}

export const handler: Handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin
  const headers = CORS_HEADERS(origin)

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 200, headers, body: ''}
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {...headers, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method Not Allowed'}),
    }
  }

  let payload: {invoiceId?: string; orderId?: string} = {}
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return {
      statusCode: 400,
      headers: {...headers, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Invalid JSON body'}),
    }
  }

  if (!payload.invoiceId && !payload.orderId) {
    return {
      statusCode: 400,
      headers: {...headers, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Provide invoiceId or orderId'}),
    }
  }

  try {
    // Fetch print settings and packing data in parallel
    const [printSettings, packingData] = await Promise.all([
      fetchPrintSettings(sanity),
      fetchPackingData(payload.invoiceId, payload.orderId),
    ])

    if (!packingData) {
      return {
        statusCode: 404,
        headers: {...headers, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Packing slip data not found'}),
      }
    }

    const pdfBytes = await buildPdf(packingData, printSettings)
    const base64 = Buffer.from(pdfBytes).toString('base64')

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="packing-slip-${packingData.orderNumber.replace(/[^a-z0-9_-]/gi, '') || 'order'}.pdf"`,
      },
      body: base64,
      isBase64Encoded: true,
    }
  } catch (err: any) {
    console.error('generatePackingSlips error', err)
    return {
      statusCode: 500,
      headers: {...headers, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        error: 'Packing slip generation failed',
        message: err?.message || String(err),
      }),
    }
  }
}

export default handler
