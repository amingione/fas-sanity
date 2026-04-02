import {getCliClient} from 'sanity/cli'

type InvoiceDoc = {
  _id: string
  invoiceNumber?: string | null
  title?: string | null
  orderNumber?: string | null
  orderRef?: {_ref?: string | null} | null
  billTo?: {name?: string | null} | null
  customerRef?: {name?: string | null} | null
  order?: {_id: string; orderNumber?: string | null; customerName?: string | null} | null
}

type OrderDoc = {
  _id: string
  orderNumber?: string | null
  invoiceRef?: {_ref?: string | null} | null
  customerName?: string | null
}

const client = getCliClient({apiVersion: '2024-10-01'})
const dryRun = process.argv.includes('--dry-run')
const auditOnly = process.argv.includes('--audit')

const formatOrderNumber = (value?: string | null): string | null => {
  if (!value) return null
  const trimmed = value.toString().trim().toUpperCase()
  if (!trimmed) return null
  if (/^FAS-\d{6}$/.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length >= 6) return `FAS-${digits.slice(-6)}`
  return null
}

const invoiceFromOrder = (value?: string | null): string | null => {
  const orderNumber = formatOrderNumber(value)
  if (!orderNumber) return null
  const digits = orderNumber.replace(/\D/g, '')
  if (!digits) return null
  return `INV-${digits.slice(-6)}`
}

const orderFromInvoice = (value?: string | null): string | null => {
  if (!value) return null
  const digits = value.toString().replace(/\D/g, '')
  if (digits.length >= 6) return `FAS-${digits.slice(-6)}`
  return null
}

const makeTitle = (name?: string | null, orderNumber?: string | null) => {
  if (!orderNumber) return name || null
  return `${name || 'Invoice'} • ${orderNumber}`
}

const chunk = <T,>(input: T[], size = 25): T[][] => {
  const groups: T[][] = []
  for (let i = 0; i < input.length; i += size) {
    groups.push(input.slice(i, i + size))
  }
  return groups
}

async function main() {
  console.log('Fetching orders…')
  const orders: OrderDoc[] = await client.fetch(
    `*[_type == "order"]{_id, orderNumber, invoiceRef, customerName}`,
  )
  const ordersById = new Map<string, OrderDoc>()
  const ordersByNumber = new Map<string, OrderDoc>()
  orders.forEach((order) => {
    ordersById.set(order._id, order)
    const normalized = formatOrderNumber(order.orderNumber)
    if (normalized) ordersByNumber.set(normalized, order)
  })

  console.log('Fetching invoices…')
  const invoices: InvoiceDoc[] = await client.fetch(
    `*[_type == "invoice"]{
      _id,
      invoiceNumber,
      title,
      orderNumber,
      billTo{name},
      customerRef->{name},
      orderRef,
      "order": orderRef->{_id, orderNumber, customerName}
    }`,
  )

  let missingOrderRef = 0
  let invoiceNumberMismatch = 0
  let titleFixes = 0
  const invoicePatches: Array<{id: string; set: Record<string, any>}> = []
  const orderLinks = new Map<string, string>() // orderId -> invoiceId

  invoices.forEach((invoice) => {
    const explicitOrderId = invoice.order?._id || invoice.orderRef?._ref || null
    const inferredOrderNumber =
      formatOrderNumber(invoice.order?.orderNumber || invoice.orderNumber) ||
      orderFromInvoice(invoice.invoiceNumber)

    const order =
      (explicitOrderId ? ordersById.get(explicitOrderId) : null) ||
      (inferredOrderNumber ? ordersByNumber.get(inferredOrderNumber) : null) ||
      null

    const setOps: Record<string, any> = {}

    if (order && (!invoice.orderRef?._ref || invoice.orderRef._ref !== order._id)) {
      setOps.orderRef = {_type: 'reference', _ref: order._id}
      missingOrderRef++
    } else if (!order && !invoice.orderRef?._ref) {
      missingOrderRef++
    }

    if (order?.orderNumber && invoice.orderNumber !== order.orderNumber) {
      setOps.orderNumber = order.orderNumber
    }

    const expectedInvoiceNumber =
      invoiceFromOrder(order?.orderNumber) || invoiceFromOrder(inferredOrderNumber)
    if (expectedInvoiceNumber && invoice.invoiceNumber !== expectedInvoiceNumber) {
      setOps.invoiceNumber = expectedInvoiceNumber
      invoiceNumberMismatch++
    }

    const expectedTitle = makeTitle(
      invoice.billTo?.name || invoice.customerRef?.name || order?.customerName,
      order?.orderNumber || inferredOrderNumber,
    )
    if (expectedTitle && invoice.title !== expectedTitle) {
      setOps.title = expectedTitle
      titleFixes++
    }

    if (Object.keys(setOps).length > 0) {
      invoicePatches.push({id: invoice._id, set: setOps})
    }

    if (order && (!order.invoiceRef?._ref || order.invoiceRef._ref !== invoice._id)) {
      orderLinks.set(order._id, invoice._id)
    }
  })

  console.log(
    `Invoices scanned: ${invoices.length} | Orders scanned: ${orders.length} | Patches: ${invoicePatches.length} invoices, ${orderLinks.size} orders`,
  )
  console.log(
    `Audit: missing orderRef=${missingOrderRef}, invoice number fixes=${invoiceNumberMismatch}, title fixes=${titleFixes}`,
  )

  if (auditOnly || dryRun) {
    console.log(dryRun ? 'Dry run - no changes applied.' : 'Audit only - no changes applied.')
    return
  }

  for (const group of chunk(invoicePatches, 20)) {
    const tx = client.transaction()
    group.forEach((patch) => {
      tx.patch(patch.id, {set: patch.set})
    })
    await tx.commit({autoGenerateArrayKeys: true})
  }

  const orderLinkEntries = Array.from(orderLinks.entries())
  for (const group of chunk(orderLinkEntries, 20)) {
    const tx = client.transaction()
    group.forEach(([orderId, invoiceId]) => {
      tx.patch(orderId, {set: {invoiceRef: {_type: 'reference', _ref: invoiceId}}})
    })
    await tx.commit({autoGenerateArrayKeys: true})
  }

  console.log('✓ Invoice/order numbering and links updated')
}

main().catch((err) => {
  console.error('fix-invoice-order-links failed', err)
  process.exit(1)
})
