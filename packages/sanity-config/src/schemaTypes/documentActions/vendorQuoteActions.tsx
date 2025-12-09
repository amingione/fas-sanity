import {useState} from 'react'
import {Box, Button, Flex, Stack, Text, useToast} from '@sanity/ui'
import type {DocumentActionComponent} from 'sanity'
import type {DocumentStub} from '../../types/sanity'
import {useClient} from 'sanity'
import {generateReferenceCode} from '../../../../../shared/referenceCodes'
import {calculateVendorItemSubtotal} from '../../../../../shared/vendorPricing'
import {getNetlifyFnBase} from './netlifyFnBase'
import {formatInvoiceNumberFromOrder} from '../../utils/orderNumber'

const API_VERSION = '2024-10-01'

const createKey = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return Math.random().toString(36).slice(2)
}

const PAYMENT_TERM_DAYS: Record<string, number> = {
  due_on_receipt: 0,
  net_15: 15,
  net_30: 30,
  net_60: 60,
  net_90: 90,
}

const toBillAddress = (address?: any) => {
  if (!address) return undefined
  return {
    address_line1: address.street || '',
    address_line2: '',
    city_locality: address.city || '',
    state_province: address.state || '',
    postal_code: address.zip || '',
    country_code: (address.country || 'US').toUpperCase(),
  }
}

const computeDueDate = (paymentTerms?: string) => {
  const days = PAYMENT_TERM_DAYS[paymentTerms || '']
  if (typeof days !== 'number') return undefined
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

type CalculatedOrderItem = {
  source: any
  order: any
  invoice: any
  unitPrice: number
  subtotal: number
  quantity: number
  _key: string
}

const buildOrderCartItem = (item: any, unitPrice: number, subtotal: number) => {
  const product = item.product || {}
  const title = product.title || item.description || 'Product'
  return {
    _type: 'orderCartItem',
    _key: item._key || createKey(),
    name: title,
    productRef: product._id ? {_type: 'reference', _ref: product._id} : undefined,
    sku: product.sku,
    price: unitPrice,
    quantity: item.quantity || 1,
    lineTotal: subtotal,
    total: subtotal,
    id: product._id,
    productName: title,
  }
}

const buildInvoiceLineItem = (item: any, unitPrice: number, subtotal: number) => ({
  _type: 'invoiceLineItem',
  _key: item._key || createKey(),
  kind: 'product',
  product: item.product?._id ? {_type: 'reference', _ref: item.product._id} : undefined,
  description: item.product?.title || item.description || 'Product',
  sku: item.product?.sku,
  quantity: item.quantity || 1,
  unitPrice,
  lineTotal: subtotal,
})

const fetchQuoteQuery = `*[_type == "vendorQuote" && _id == $id][0]{
  _id,
  quoteNumber,
  status,
  pricingTier,
  customDiscountPercentage,
  shipping,
  tax,
  total,
  notes,
  validUntil,
  items[]{
    _key,
    quantity,
    description,
    unitPrice,
    subtotal,
    product->{
      _id,
      title,
      sku,
      price,
      wholesalePriceStandard,
      wholesalePricePreferred,
      wholesalePricePlatinum,
      pricingTiers
    }
  },
  vendor->{
    _id,
    companyName,
    primaryContact,
    paymentTerms,
    pricingTier,
    customDiscountPercentage,
    businessAddress,
    shippingAddress
  }
}`

const fetchQuoteSummaryQuery = `*[_type == "vendorQuote" && _id == $id][0]{
  quoteNumber,
  total,
  validUntil,
  vendor->{companyName, primaryContact}
}`

const sendVendorEmail = async (
  to: string | undefined,
  body: {template: 'quote' | 'order'; data: Record<string, any>},
) => {
  if (!to) throw new Error('Vendor email is missing')
  const base = getNetlifyFnBase()
  const response = await fetch(`${base}/.netlify/functions/sendVendorEmail`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({to, template: body.template, data: body.data}),
  })
  if (!response.ok) {
    throw new Error('Email send failed')
  }
}

export const convertVendorQuoteAction: DocumentActionComponent = (props) => {
  const toast = useToast()
  const client = useClient({apiVersion: API_VERSION})
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (props.type !== 'vendorQuote') return null
  const docId = props.id.replace(/^drafts\./, '')
  const hasOrder = Boolean((props.draft || props.published)?.convertedToOrder)

  const handleConvert = async () => {
    setBusy(true)
    try {
      const quote = await client.fetch(fetchQuoteQuery, {id: docId})
      if (!quote) throw new Error('Quote not found')
      if (!quote.vendor?._id) throw new Error('Vendor is required')
      const vendor = quote.vendor
      const tier = quote.pricingTier || vendor.pricingTier || 'standard'
      const customDiscount =
        typeof quote.customDiscountPercentage === 'number'
          ? quote.customDiscountPercentage
          : vendor.customDiscountPercentage
      const items = Array.isArray(quote.items) ? quote.items : []
      if (!items.length) throw new Error('Add at least one item to the quote')

      const orderItems: CalculatedOrderItem[] = items.map((item: any) => {
        const {unitPrice, subtotal, quantity} = calculateVendorItemSubtotal(
          {
            product: item.product,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            tier,
            customDiscountPercentage: customDiscount,
          },
          tier,
          customDiscount,
        )
        return {
          source: item,
          order: buildOrderCartItem(item, unitPrice, subtotal),
          invoice: buildInvoiceLineItem(item, unitPrice, subtotal),
          unitPrice,
          subtotal,
          quantity,
          _key: item._key || createKey(),
        }
      })

      const subtotal = orderItems.reduce((sum, item) => sum + item.subtotal, 0)
      const shipping = Number(quote.shipping) || 0
      const tax = Number(quote.tax) || 0
      const total = Number.isFinite(Number(quote.total)) ? Number(quote.total) : subtotal + shipping + tax

      const nowIso = new Date().toISOString()
      const orderDoc: DocumentStub<Record<string, any>> = {
        _type: 'order',
        orderNumber: quote.quoteNumber || undefined,
        orderType: 'wholesale',
        status: 'pending',
        currency: 'USD',
        wholesaleWorkflowStatus: 'requested',
        wholesaleDetails: {
          vendor: {_type: 'reference', _ref: vendor._id},
          pricingTier: tier,
          paymentTerms: vendor.paymentTerms || 'net_30',
          notes: `Converted from ${quote.quoteNumber || quote._id}`,
        },
        customerName: vendor.companyName,
        customerEmail: vendor.primaryContact?.email,
        cart: orderItems.map((item) => item.order),
        amountSubtotal: subtotal,
        amountTax: tax,
        amountDiscount: 0,
        amountShipping: shipping,
        totalAmount: total,
        notes: quote.notes,
        createdAt: nowIso,
      }

      const createdOrder = await client.create(orderDoc, {autoGenerateArrayKeys: true})

      const invoiceNumber =
        formatInvoiceNumberFromOrder(createdOrder.orderNumber) ||
        (await generateReferenceCode(client, {
          prefix: 'INV-',
          typeName: 'invoice',
          fieldName: 'invoiceNumber',
        }))
      const billTo = toBillAddress(vendor.businessAddress)
      const shipTo = toBillAddress(vendor.shippingAddress || vendor.businessAddress)
      const invoiceTitle =
        createdOrder.orderNumber && vendor.companyName
          ? `${vendor.companyName} • ${createdOrder.orderNumber}`
          : `Wholesale order ${quote.quoteNumber || ''}`
      const invoiceDoc: DocumentStub<Record<string, any>> = {
        _type: 'invoice',
        title: invoiceTitle,
        invoiceNumber,
        orderNumber: createdOrder.orderNumber || undefined,
        orderRef: {_type: 'reference', _ref: createdOrder._id},
        billTo: billTo
          ? {
              name: vendor.companyName,
              email: vendor.primaryContact?.email,
              phone: vendor.primaryContact?.phone,
              ...billTo,
            }
          : undefined,
        shipTo: shipTo
          ? {
              name: vendor.companyName,
              email: vendor.primaryContact?.email,
              phone: vendor.primaryContact?.phone,
              ...shipTo,
            }
          : undefined,
        lineItems: orderItems.map((item) => item.invoice),
        subtotal,
        total,
        amountShipping: shipping,
        taxRate: subtotal > 0 ? (tax / subtotal) * 100 : undefined,
        status: 'pending',
        invoiceDate: new Date().toISOString().slice(0, 10),
        dueDate: computeDueDate(vendor.paymentTerms),
        paymentTerms: vendor.paymentTerms,
        customerNotes: quote.notes,
      }
      const createdInvoice = await client.create(invoiceDoc, {autoGenerateArrayKeys: true})
      await client
        .patch(createdOrder._id)
        .set({
          invoiceRef: {_type: 'reference', _ref: createdInvoice._id},
        })
        .commit({autoGenerateArrayKeys: true})

      const updatedItems = orderItems.map((item) => ({
        _key: item._key,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        description: item.source?.product?.title || item.source?.description,
        product: item.source?.product?._id ? {_type: 'reference', _ref: item.source.product._id} : undefined,
      }))

      const tx = client.transaction()
      if (props.published) {
        tx.patch(docId, (patch) =>
          patch.set({
            status: 'converted',
            subtotal,
            shipping,
            tax,
            total,
            convertedToOrder: {_type: 'reference', _ref: createdOrder._id},
            items: updatedItems,
            approvedAt: quote.approvedAt || nowIso,
          }),
        )
      }
      if (props.draft) {
        tx.patch(`drafts.${docId}`, (patch) =>
          patch.set({
            status: 'converted',
            subtotal,
            shipping,
            tax,
            total,
            convertedToOrder: {_type: 'reference', _ref: createdOrder._id},
            items: updatedItems,
            approvedAt: quote.approvedAt || nowIso,
          }),
        )
      }
      await tx.commit({autoGenerateArrayKeys: true})

      await client
        .patch(vendor._id)
        .setIfMissing({totalOrders: 0, totalRevenue: 0, currentBalance: 0})
        .set({lastOrderDate: nowIso})
        .inc({totalOrders: 1, totalRevenue: total, currentBalance: total})
        .commit({autoGenerateArrayKeys: true})

      await sendVendorEmail(vendor.primaryContact?.email, {
        template: 'order',
        data: {
          companyName: vendor.companyName,
          contactName: vendor.primaryContact?.name,
          orderNumber: createdOrder.orderNumber || createdOrder._id,
          total,
          paymentTerms: vendor.paymentTerms,
        },
      })

      toast.push({status: 'success', title: 'Order and invoice created'})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.push({status: 'error', title: 'Conversion failed', description: message})
    } finally {
      setBusy(false)
      setOpen(false)
      props.onComplete()
    }
  }

  return {
    label: 'Convert to Order',
    tone: 'primary',
    disabled: hasOrder,
    onHandle: () => setOpen(true),
    dialog: open
      ? {
          type: 'dialog',
          header: 'Convert quote to wholesale order',
          onClose: () => {
            setOpen(false)
            props.onComplete()
          },
          content: (
            <Box padding={4}>
              <Stack space={4}>
                <Text>Creates a wholesale order and invoice using this quote. Continue?</Text>
                <Flex justify="flex-end" gap={3}>
                  <Button text="Cancel" mode="ghost" disabled={busy} onClick={() => setOpen(false)} />
                  <Button text="Convert" tone="primary" loading={busy} onClick={handleConvert} />
                </Flex>
              </Stack>
            </Box>
          ),
        }
      : undefined,
  }
}

export const sendVendorQuoteEmailAction: DocumentActionComponent = (props) => {
  const toast = useToast()
  const client = useClient({apiVersion: API_VERSION})
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (props.type !== 'vendorQuote') return null
  const docId = props.id.replace(/^drafts\./, '')

  const handleSend = async () => {
    setBusy(true)
    try {
      const quote = await client.fetch(fetchQuoteSummaryQuery, {id: docId})
      if (!quote) throw new Error('Quote not found')
      const vendorEmail = quote.vendor?.primaryContact?.email
      await sendVendorEmail(vendorEmail, {
        template: 'quote',
        data: {
          companyName: quote.vendor?.companyName,
          contactName: quote.vendor?.primaryContact?.name,
          quoteNumber: quote.quoteNumber || docId,
          total: quote.total,
          validUntil: quote.validUntil,
        },
      })

      const patchOps = {status: 'sent', sentAt: new Date().toISOString()}
      const tx = client.transaction()
      if (props.published) tx.patch(docId, (patch) => patch.set(patchOps))
      if (props.draft) tx.patch(`drafts.${docId}`, (patch) => patch.set(patchOps))
      await tx.commit({autoGenerateArrayKeys: true})

      toast.push({status: 'success', title: 'Quote emailed to vendor'})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.push({status: 'error', title: 'Email failed', description: message})
    } finally {
      setBusy(false)
      setOpen(false)
      props.onComplete()
    }
  }

  return {
    label: 'Send Quote',
    tone: 'primary',
    onHandle: () => setOpen(true),
    dialog: open
      ? {
          type: 'dialog',
          header: 'Email this quote to the vendor?',
          onClose: () => {
            setOpen(false)
            props.onComplete()
          },
          content: (
            <Box padding={4}>
              <Stack space={4}>
                <Text>This queues a branded quote email using the vendor contact on file.</Text>
                <Flex justify="flex-end" gap={3}>
                  <Button text="Cancel" mode="ghost" disabled={busy} onClick={() => setOpen(false)} />
                  <Button text="Send Email" tone="primary" loading={busy} onClick={handleSend} />
                </Flex>
              </Stack>
            </Box>
          ),
        }
      : undefined,
  }
}
