/**
 * FIELD MAPPING NOTE
 * This file must conform to:
 * .docs/reports/field-to-api-map.md
 *
 * Do not introduce new field names or mappings
 * without updating and authorizing changes
 * to the canonical field-to-API map.
 */
import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {requireSanityCredentials} from '../lib/sanityEnv'

const DEFAULT_ORIGINS = (
  process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333'
).split(',')
function makeCORS(origin?: string) {
  let o = DEFAULT_ORIGINS[0]
  if (origin) {
    if (/^http:\/\/localhost:\d+$/i.test(origin)) o = origin
    else if (DEFAULT_ORIGINS.includes(origin)) o = origin
  }
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

const sanityCreds = requireSanityCredentials()
const sanity = createClient({
  projectId: sanityCreds.projectId,
  dataset: sanityCreds.dataset,
  apiVersion: '2024-04-10',
  token: sanityCreds.token,
  useCdn: false,
})

const ORDER_NUMBER_PREFIX = 'FAS'
const INVOICE_PREFIX = 'INV'

function sanitizeOrderNumber(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim().toUpperCase()
  if (!trimmed) return undefined
  if (/^FAS-\d{6}$/.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length >= 6) return `${ORDER_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

function normalizeInvoiceNumber(value?: string | null): string | undefined {
  if (!value) return undefined
  const digits = value.toString().replace(/\D/g, '')
  if (digits.length >= 6) return `${INVOICE_PREFIX}-${digits.slice(-6)}`
  return undefined
}

function invoiceNumberFromOrder(value?: string | null): string | undefined {
  const orderNumber = sanitizeOrderNumber(value)
  if (!orderNumber) return undefined
  return `${INVOICE_PREFIX}-${orderNumber.replace(/\D/g, '').slice(-6)}`
}

function orderNumberFromInvoice(value?: string | null): string | undefined {
  const digits = value ? value.toString().replace(/\D/g, '') : ''
  if (digits.length >= 6) return `${ORDER_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

function candidateFromSessionId(id?: string | null): string | undefined {
  if (!id) return undefined
  const core = id
    .toString()
    .trim()
    .replace(/^cs_(?:test|live)_/i, '')
  const digits = core.replace(/\D/g, '')
  if (digits.length >= 6) return `${ORDER_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

async function generateUniqueInvoiceNumber(
  preferredOrderNumber?: string | null,
  existingCandidates: Array<string | null | undefined> = [],
): Promise<string> {
  const candidates = [preferredOrderNumber, ...existingCandidates]

  for (const candidate of candidates) {
    const sanitized = invoiceNumberFromOrder(candidate) || normalizeInvoiceNumber(candidate)
    if (!sanitized) continue
    const exists = await sanity.fetch<number>(
      'count(*[_type == "invoice" && invoiceNumber == $num])',
      {num: sanitized},
    )
    if (!Number(exists)) return sanitized
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const randomCandidate = `${INVOICE_PREFIX}-${Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0')}`
    const exists = await sanity.fetch<number>(
      'count(*[_type == "invoice" && invoiceNumber == $num])',
      {num: randomCandidate},
    )
    if (!Number(exists)) return randomCandidate
  }

  return `${INVOICE_PREFIX}-${String(Math.floor(Date.now() % 1_000_000)).padStart(6, '0')}`
}

function pickString(...values: Array<any>): string | undefined {
  for (const value of values) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) return trimmed
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      const asString = String(value)
      if (asString.trim()) return asString.trim()
    }
  }
  return undefined
}

function buildAddress(
  source: any,
  type: 'billTo' | 'shipTo',
  opts: {fallbackEmail?: string; fallbackName?: string} = {},
): Record<string, any> | undefined {
  if (!source || typeof source !== 'object') return undefined
  const name = pickString(source.name, source.fullName, opts.fallbackName)
  const email = pickString(source.email, opts.fallbackEmail)
  const phone = pickString(source.phone, source.phoneNumber)
  const address_line1 = pickString(source.address_line1, source.addressLine1, source.line1)
  const address_line2 = pickString(source.address_line2, source.addressLine2, source.line2)
  const city_locality = pickString(source.city_locality, source.city)
  const state_province = pickString(source.state_province, source.state, source.region)
  const postal_code = pickString(source.postal_code, source.postalCode, source.zip)
  const country_code = pickString(source.country_code, source.country)

  if (
    !name &&
    !email &&
    !phone &&
    !address_line1 &&
    !address_line2 &&
    !city_locality &&
    !state_province &&
    !postal_code &&
    !country_code
  ) {
    return undefined
  }

  const base: Record<string, any> = {_type: type}
  if (name) base.name = name
  if (email) base.email = email
  if (phone) base.phone = phone
  if (address_line1) base.address_line1 = address_line1
  if (address_line2) base.address_line2 = address_line2
  if (city_locality) base.city_locality = city_locality
  if (state_province) base.state_province = state_province
  if (postal_code) base.postal_code = postal_code
  if (country_code) base.country_code = country_code.toUpperCase()
  return base
}

function computeTaxRateFromAmounts(amountSubtotal?: any, amountTax?: any): number | undefined {
  const sub = Number(amountSubtotal)
  const tax = Number(amountTax)
  if (!Number.isFinite(sub) || sub <= 0) {
    if (Number.isFinite(tax) && tax === 0) return 0
    return undefined
  }
  if (!Number.isFinite(tax) || tax < 0) return undefined
  const pct = (tax / sub) * 100
  return Math.round(pct * 100) / 100
}

function dateStringFrom(value?: any): string | undefined {
  if (!value) return undefined
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return undefined
    return date.toISOString().slice(0, 10)
  } catch {
    return undefined
  }
}

function parseLimit(value: any): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined
  return Math.floor(numeric)
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return {statusCode: 200, headers: CORS, body: ''}
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET')
    return {
      statusCode: 405,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method Not Allowed'}),
    }

  const expected = (process.env.BACKFILL_SECRET || '').trim()
  const presented = (
    (event.headers?.authorization || '').replace(/^Bearer\s+/i, '') ||
    event.queryStringParameters?.token ||
    ''
  ).trim()
  if (expected && presented !== expected)
    return {
      statusCode: 401,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Unauthorized'}),
    }

  let dryRun = (event.queryStringParameters?.dryRun || '').toLowerCase() === 'true'
  let limit = parseLimit(event.queryStringParameters?.limit)
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}')
      if (typeof body.dryRun === 'boolean') dryRun = body.dryRun
      const bodyLimit = parseLimit(body.limit)
      if (bodyLimit !== undefined) limit = bodyLimit
    } catch {}
  }

  const pageSize = limit ? Math.min(limit, 100) : 100
  let cursor = ''
  let total = 0
  let changed = 0
  let migratedCustomer = 0
  let migratedOrder = 0
  let ordersLinked = 0
  let itemsFixed = 0
  let legacyConverted = 0
  let billToFilled = 0
  let shipToFilled = 0
  let taxRateUpdated = 0
  let titleUpdated = 0
  let datesUpdated = 0

  try {
    outer: while (true) {
      const docs: any[] = await sanity.fetch(
        `*[_type == "invoice" && _id > $cursor] | order(_id) {
          _id,
          lineItems,
          customerRef,
          customer,
          orderRef,
          order,
          invoiceNumber,
          orderNumber,
          stripeSessionId,
          billTo,
          shipTo,
          taxRate,
          title,
          customerEmail,
          amountSubtotal,
          amountTax,
          invoiceDate,
          dueDate,
          _createdAt
        }[0...$limit]`,
        {cursor, limit: pageSize},
      )
      if (!docs?.length) break
      for (const d of docs) {
        total++
        const setOps: Record<string, any> = {}
        const unsetOps: string[] = []

        let orderRefId = d?.orderRef?._ref || d?.order?._ref
        let orderDoc: any = null
        const inferredOrderNumber =
          sanitizeOrderNumber(d.orderNumber) ||
          sanitizeOrderNumber(orderNumberFromInvoice(d.invoiceNumber)) ||
          sanitizeOrderNumber(candidateFromSessionId(d.stripeSessionId))

        if (!orderRefId && inferredOrderNumber) {
          try {
            orderDoc = await sanity.fetch(
              `*[_type == "order" && orderNumber == $num][0]{
                _id,
                orderNumber,
                cart,
                shippingAddress,
                customerName,
                customerEmail,
                amountSubtotal,
                amountTax,
                createdAt,
                stripeSessionId,
                totalAmount,
                invoiceRef
              }`,
              {num: inferredOrderNumber},
            )
            orderRefId = orderDoc?._id || orderRefId
          } catch {
            orderDoc = null
          }
        }

        if (!orderDoc && orderRefId) {
          try {
            orderDoc = await sanity.fetch(
              `*[_type == "order" && _id == $id][0]{
                _id,
                orderNumber,
                cart,
                shippingAddress,
                customerName,
                customerEmail,
                amountSubtotal,
                amountTax,
                createdAt,
                stripeSessionId,
                totalAmount,
                invoiceRef
              }`,
              {id: orderRefId},
            )
          } catch {
            orderDoc = null
          }
        }

        if (!d.customerRef && d.customer?._ref) {
          setOps.customerRef = {_type: 'reference', _ref: d.customer._ref}
          unsetOps.push('customer')
        } else if (d.customer) unsetOps.push('customer')

        const needsWeakOrderRef =
          !!d.orderRef && !!d.orderRef._ref && d.orderRef._weak !== true

        if (
          orderDoc?._id &&
          (!d.orderRef || d.orderRef._ref !== orderDoc._id || d.orderRef._weak !== true)
        ) {
          setOps.orderRef = {_type: 'reference', _ref: orderDoc._id, _weak: true}
          orderRefId = orderDoc._id
          unsetOps.push('order')
          migratedOrder++
        } else if (!orderRefId && d.order?._ref) {
          setOps.orderRef = {_type: 'reference', _ref: d.order._ref, _weak: true}
          orderRefId = d.order._ref
          unsetOps.push('order')
          migratedOrder++
        } else if (needsWeakOrderRef) {
          setOps.orderRef = {_type: 'reference', _ref: d.orderRef._ref, _weak: true}
          orderRefId = d.orderRef._ref
          migratedOrder++
        } else if (d.order) unsetOps.push('order')

        if (Array.isArray(d.lineItems)) {
          const hasMissing = d.lineItems.some((it: any) => it && typeof it === 'object' && !it._key)
          const hasLegacy = d.lineItems.some(
            (it: any) => it && typeof it === 'object' && it._type === 'lineItem',
          )
          if (hasLegacy) {
            // Use order cart for better mapping when we have it
            const orderCart: any[] = Array.isArray(orderDoc?.cart) ? orderDoc.cart : []

            const mapped = await Promise.all(
              d.lineItems.map(async (li: any) => {
                if (!li || typeof li !== 'object') return li
                if (li._type !== 'lineItem') return li
                const qty = Number(li.quantity || 1)
                const lineTotal = Number(li.amount_total || li.line_total || 0)
                const unitPrice =
                  qty > 0 && Number.isFinite(lineTotal) ? lineTotal / qty : undefined
                const desc = (li.description || li.name || '').toString()
                let sku = ''
                let productId = ''
                const match = orderCart.find((c: any) => (c?.name || '').toString() === desc)
                if (match) sku = (match.sku || '').toString()
                if (sku) {
                  try {
                    productId =
                      (await sanity.fetch(`*[_type == "product" && sku == $sku][0]._id`, {sku})) ||
                      ''
                  } catch {}
                }
                if (!productId && desc) {
                  try {
                    productId =
                      (await sanity.fetch(`*[_type == "product" && title == $t][0]._id`, {
                        t: desc,
                      })) || ''
                  } catch {}
                }
                return {
                  _type: 'invoiceLineItem',
                  _key: li._key,
                  description: desc || undefined,
                  quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
                  unitPrice:
                    typeof unitPrice === 'number' && Number.isFinite(unitPrice)
                      ? unitPrice
                      : undefined,
                  lineTotal: Number.isFinite(lineTotal) && lineTotal > 0 ? lineTotal : undefined,
                  sku: sku || undefined,
                  product: productId ? {_type: 'reference', _ref: productId} : undefined,
                }
              }),
            )
            setOps.lineItems = mapped
            legacyConverted++
          } else if (hasMissing) {
            setOps.lineItems = d.lineItems
          }
        }

        const desiredOrderNumber =
          sanitizeOrderNumber(orderDoc?.orderNumber) ||
          inferredOrderNumber ||
          sanitizeOrderNumber(candidateFromSessionId(orderDoc?.stripeSessionId))

        const invoiceCandidates: Array<string | null | undefined> = [
          d.invoiceNumber,
          d.orderNumber,
          orderDoc?.orderNumber,
          desiredOrderNumber,
          orderNumberFromInvoice(d.invoiceNumber),
          candidateFromSessionId(d.stripeSessionId),
          candidateFromSessionId(orderDoc?.stripeSessionId),
          orderRefId,
          d._id,
        ]
        const desiredInvoiceNumber = await generateUniqueInvoiceNumber(
          desiredOrderNumber,
          invoiceCandidates,
        )
        if (desiredInvoiceNumber && desiredInvoiceNumber !== d.invoiceNumber) {
          setOps.invoiceNumber = desiredInvoiceNumber
        }

        if (desiredOrderNumber && desiredOrderNumber !== d.orderNumber) {
          setOps.orderNumber = desiredOrderNumber
        }

        const fallbackEmail = pickString(d.customerEmail, orderDoc?.customerEmail)
        const fallbackName = pickString(
          d?.billTo?.name,
          orderDoc?.customerName,
          orderDoc?.shippingAddress?.name,
        )
        const shippingSource = orderDoc?.shippingAddress

        if (!d.billTo && shippingSource) {
          const billFromOrder = buildAddress(shippingSource, 'billTo', {
            fallbackEmail,
            fallbackName,
          })
          if (billFromOrder) {
            setOps.billTo = billFromOrder
            billToFilled++
          }
        }

        if (!d.shipTo && shippingSource) {
          const shipFromOrder = buildAddress(shippingSource, 'shipTo', {
            fallbackEmail,
            fallbackName,
          })
          if (shipFromOrder) {
            setOps.shipTo = shipFromOrder
            shipToFilled++
          } else if (setOps.billTo) {
            setOps.shipTo = {...setOps.billTo, _type: 'shipTo'}
            shipToFilled++
          }
        }

        const currentTaxRate =
          typeof d.taxRate === 'number' && !Number.isNaN(d.taxRate) ? d.taxRate : undefined
        const computedTaxRate = computeTaxRateFromAmounts(
          d.amountSubtotal ?? orderDoc?.amountSubtotal,
          d.amountTax ?? orderDoc?.amountTax,
        )
        if (typeof computedTaxRate === 'number') {
          if (currentTaxRate === undefined || Math.abs(currentTaxRate - computedTaxRate) > 0.01) {
            setOps.taxRate = computedTaxRate
            taxRateUpdated++
          }
        }

        const createdAtDate = dateStringFrom(orderDoc?.createdAt)
        const invoiceDateCandidate = createdAtDate || dateStringFrom(d._createdAt)
        if (!d.invoiceDate && invoiceDateCandidate) {
          setOps.invoiceDate = invoiceDateCandidate
          datesUpdated++
        }
        if (!d.dueDate && invoiceDateCandidate) {
          setOps.dueDate = invoiceDateCandidate
          datesUpdated++
        }

        const orderNumberForTitle =
          sanitizeOrderNumber(
            setOps.orderNumber ||
              d.orderNumber ||
              orderDoc?.orderNumber ||
              inferredOrderNumber,
          ) || ''
        const nameForTitle = pickString(
          d?.billTo?.name,
          (setOps.billTo as any)?.name,
          orderDoc?.customerName,
          orderDoc?.shippingAddress?.name,
          fallbackEmail,
        )
        const desiredTitle = orderNumberForTitle
          ? `${nameForTitle || 'Invoice'} • ${orderNumberForTitle}`
          : nameForTitle || d.title
        if (desiredTitle && desiredTitle !== d.title) {
          setOps.title = desiredTitle
          titleUpdated++
        }

        const shouldLinkOrder =
          orderDoc?._id && (!orderDoc.invoiceRef?._ref || orderDoc.invoiceRef._ref !== d._id)

        if (Object.keys(setOps).length || unsetOps.length || shouldLinkOrder) {
          changed++
          if (!dryRun) {
            try {
              const tx = sanity.transaction()
              if (Object.keys(setOps).length || unsetOps.length) {
                tx.patch(d._id, {set: setOps, unset: unsetOps})
              }
              if (shouldLinkOrder && orderDoc?._id) {
                tx.patch(orderDoc._id, {
                  set: {
                    invoiceRef: {_type: 'reference', _ref: d._id},
                  },
                })
              }
              await tx.commit({autoGenerateArrayKeys: true})
            } catch {}
          }
          if (setOps.customerRef) migratedCustomer++
          if (setOps.orderRef) migratedOrder++
          if (setOps.lineItems) itemsFixed++
          if (shouldLinkOrder) ordersLinked++
        }
        cursor = d._id
        if (limit && total >= limit) {
          break outer
        }
      }
      if (docs.length < pageSize) break
    }
  } catch (e: any) {
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: e?.message || 'Backfill invoices failed'}),
    }
  }

  return {
    statusCode: 200,
    headers: {...CORS, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      ok: true,
      dryRun,
      total,
      changed,
      migratedCustomer,
      migratedOrder,
      itemsFixed,
      legacyConverted,
      billToFilled,
      shipToFilled,
      taxRateUpdated,
      titleUpdated,
      datesUpdated,
      ordersLinked,
      limit,
    }),
  }
}
