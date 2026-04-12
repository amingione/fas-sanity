import {useState} from 'react'
import {Box, Button, Flex, Stack, Text, useToast} from '@sanity/ui'
import type {DocumentActionComponent} from 'sanity'
import type {DocumentStub} from '../../types/sanity'
import {useClient} from 'sanity'
import {generateReferenceCode} from '../../../../../shared/referenceCodes'
import {getNetlifyFnBase} from './netlifyFnBase'

const API_VERSION = '2024-10-01'

const buildOrderCartItem = (item: any) => {
  const title = item.description || 'Item'
  return {
    _type: 'orderCartItem',
    _key: item._key || Math.random().toString(36).slice(2),
    name: title,
    sku: item.sku,
    price: Number(item.unitPrice) || 0,
    quantity: Number(item.quantity) || 1,
    lineTotal: Number(item.lineTotal ?? item.total ?? 0),
    total: Number(item.lineTotal ?? item.total ?? 0),
    id: item.product?._ref,
    productName: title,
    productRef: item.product?._ref ? {_type: 'reference', _ref: item.product._ref} : undefined,
  }
}

const resolvePortalUrl = () =>
  (process.env.SANITY_STUDIO_VENDOR_PORTAL_URL ||
    process.env.VENDOR_PORTAL_URL ||
    process.env.PUBLIC_VENDOR_PORTAL_URL ||
    process.env.SITE_URL ||
    '').replace(/\/$/, '')

const buildInvoiceEmailMessage = (payload: {
  invoiceNumber: string
  total: number
  dueDate?: string
  paymentUrl?: string
  pdfUrl: string
}) => {
  const dueLine = payload.dueDate ? `Due Date: ${payload.dueDate}` : 'Due Date: On receipt'
  const paymentLine = payload.paymentUrl ? `Pay online: ${payload.paymentUrl}` : ''
  return [
    `Your invoice ${payload.invoiceNumber} is ready.`,
    `Total: $${payload.total.toFixed(2)}`,
    dueLine,
    paymentLine,
    `Download PDF: ${payload.pdfUrl}`,
    '',
    'Thank you,',
    'FAS Motorsports',
  ]
    .filter(Boolean)
    .join('\n')
}

export const convertVendorInvoiceToOrderAction: DocumentActionComponent = (props) => {
  const toast = useToast()
  const client = useClient({apiVersion: API_VERSION})
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (props.type !== 'invoice') return null
  const docId = props.id.replace(/^drafts\./, '')
  const hasOrder = Boolean((props.draft || props.published)?.vendorOrderRef)

  const handleConvert = async () => {
    setBusy(true)
    try {
      const invoice = await client.fetch(
        `*[_type == "invoice" && _id == $id][0]{
          _id,
          invoiceNumber,
          status,
          customerRef->{_id},
          vendorRef->{_id, companyName, primaryContact, paymentTerms},
          lineItems[]{
            _key,
            description,
            sku,
            quantity,
            unitPrice,
            lineTotal,
            total,
            product->{_id}
          },
          subtotal,
          tax,
          shipping,
          total
        }`,
        {id: docId},
      )
      if (!invoice) throw new Error('Invoice not found')
      if (!invoice.vendorRef?._id) throw new Error('Invoice vendor is missing')
      if (!invoice.customerRef?._id) throw new Error('Invoice customer is missing')
      if (invoice.status !== 'paid') {
        throw new Error('Invoice must be paid before creating a vendor order.')
      }
      if (!Array.isArray(invoice.lineItems) || invoice.lineItems.length === 0) {
        throw new Error('Invoice has no line items')
      }
      if (typeof invoice.total !== 'number' || !Number.isFinite(invoice.total)) {
        throw new Error('Invoice total is missing or invalid')
      }

      const orderNumber = await generateReferenceCode(client, {
        prefix: 'VO-',
        typeName: 'vendorOrder',
        fieldName: 'orderNumber',
      })

      const subtotal = Number(invoice.subtotal) || 0
      const tax = Number(invoice.tax) || 0
      const shipping = Number(invoice.shipping) || 0
      const total = Number(invoice.total) || subtotal + tax + shipping

      const orderDoc: DocumentStub<Record<string, any>> = {
        _type: 'vendorOrder',
        orderNumber,
        vendor: {_type: 'reference', _ref: invoice.vendorRef._id},
        customerRef: {_type: 'reference', _ref: invoice.customerRef._id},
        invoiceRef: {_type: 'reference', _ref: invoice._id},
        status: 'paid',
        paymentStatus: 'paid',
        currency: 'USD',
        cart: invoice.lineItems.map(buildOrderCartItem),
        amountSubtotal: subtotal,
        amountTax: tax,
        amountShipping: shipping,
        totalAmount: total,
        createdAt: new Date().toISOString(),
      }

      const createdOrder = await client.create(orderDoc, {autoGenerateArrayKeys: true})

      await client
        .patch(invoice._id)
        .set({
          vendorOrderRef: {_type: 'reference', _ref: createdOrder._id},
          orderNumber: createdOrder.orderNumber,
          status: 'payable',
          amountDue: total,
        })
        .commit({autoGenerateArrayKeys: true})

      await client
        .patch(invoice.vendorRef._id)
        .setIfMissing({totalOrders: 0, totalRevenue: 0, currentBalance: 0})
        .set({lastOrderDate: new Date().toISOString()})
        .inc({totalOrders: 1, totalRevenue: total, currentBalance: total})
        .commit({autoGenerateArrayKeys: true})

      const portalBase = resolvePortalUrl()
      const orderUrl = portalBase ? `${portalBase}/vendor-portal/orders/${createdOrder._id}` : ''
      const payUrl = portalBase ? `${portalBase}/vendor-portal/invoices/${invoice._id}` : ''
      const base = getNetlifyFnBase()

      await fetch(`${base}/.netlify/functions/sendVendorEmail`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          to: invoice.vendorRef.primaryContact?.email,
          template: 'order',
          data: {
            companyName: invoice.vendorRef.companyName,
            contactName: invoice.vendorRef.primaryContact?.name,
            orderNumber: createdOrder.orderNumber || createdOrder._id,
            total,
            paymentTerms: invoice.vendorRef.paymentTerms,
            portalUrl: orderUrl || undefined,
            paymentUrl: payUrl || undefined,
          },
        }),
      })

      toast.push({status: 'success', title: 'Vendor order created'})
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
    label: 'Create Vendor Order (Paid Only)',
    tone: 'primary',
    disabled: hasOrder,
    onHandle: () => setOpen(true),
    dialog: open
      ? {
          type: 'dialog',
          header: 'Convert invoice to vendor order',
          onClose: () => {
            setOpen(false)
            props.onComplete()
          },
          content: (
            <Box padding={4}>
              <Stack space={4}>
                <Text>Creates a vendor order from this paid invoice. Continue?</Text>
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

export const sendInvoiceEmailAction: DocumentActionComponent = (props) => {
  const toast = useToast()
  const client = useClient({apiVersion: API_VERSION})
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (props.type !== 'invoice') return null
  const docId = props.id.replace(/^drafts\./, '')

  const handleSend = async () => {
    setBusy(true)
    try {
      const invoice = await client.fetch(
        `*[_type == "invoice" && _id == $id][0]{
          _id,
          invoiceNumber,
          total,
          dueDate,
          billTo,
          customerRef->{email}
        }`,
        {id: docId},
      )
      if (!invoice) throw new Error('Invoice not found')
      const toEmail = invoice.billTo?.email || invoice.customerRef?.email
      if (!toEmail) throw new Error('Invoice recipient email is missing (billTo.email/customer.email)')

      const base = getNetlifyFnBase().replace(/\/$/, '')
      const pdfUrl = `${base}/.netlify/functions/generateInvoicePDF?invoiceId=${encodeURIComponent(docId)}`
      const portalBase = resolvePortalUrl()
      const payUrl = portalBase ? `${portalBase}/vendor-portal/invoices/${invoice._id}` : ''
      const subject = `Invoice ${invoice.invoiceNumber || docId} from FAS Motorsports`
      const message = buildInvoiceEmailMessage({
        invoiceNumber: invoice.invoiceNumber || docId,
        total: Number(invoice.total) || 0,
        dueDate: invoice.dueDate,
        paymentUrl: payUrl || undefined,
        pdfUrl,
      })

      const res = await fetch(`${base}/.netlify/functions/sendCustomerEmail`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          to: toEmail,
          subject,
          message,
          template: 'invoice',
        }),
      })
      const payload = (await res.json().catch(() => ({}))) as {error?: string}
      if (!res.ok || payload?.error) {
        throw new Error(payload?.error || 'Invoice email send failed')
      }

      const patchOps = {
        status: 'sent',
        sentAt: new Date().toISOString(),
        lastEmailTo: toEmail,
        emailStatus: 'sent',
      }
      const tx = client.transaction()
      if (props.published) tx.patch(docId, (patch) => patch.set(patchOps).inc({emailSendCount: 1}))
      if (props.draft) tx.patch(`drafts.${docId}`, (patch) => patch.set(patchOps).inc({emailSendCount: 1}))
      await tx.commit({autoGenerateArrayKeys: true})

      toast.push({status: 'success', title: 'Invoice emailed to client'})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      const tx = client.transaction()
      if (props.published) tx.patch(docId, (patch) => patch.set({emailStatus: 'failed', lastEmailError: message}))
      if (props.draft) tx.patch(`drafts.${docId}`, (patch) => patch.set({emailStatus: 'failed', lastEmailError: message}))
      await tx.commit({autoGenerateArrayKeys: true}).catch(() => undefined)
      toast.push({status: 'error', title: 'Invoice email failed', description: message})
    } finally {
      setBusy(false)
      setOpen(false)
      props.onComplete()
    }
  }

  return {
    label: 'Send Invoice Email',
    tone: 'primary',
    onHandle: () => setOpen(true),
    dialog: open
      ? {
          type: 'dialog',
          header: 'Email invoice to client?',
          onClose: () => {
            setOpen(false)
            props.onComplete()
          },
          content: (
            <Box padding={4}>
              <Stack space={4}>
                <Text>Sends invoice details + PDF link using Resend.</Text>
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

export const printInvoiceAction: DocumentActionComponent = (props) => {
  const toast = useToast()
  const client = useClient({apiVersion: API_VERSION})
  const [busy, setBusy] = useState(false)

  if (props.type !== 'invoice') return null
  const docId = props.id.replace(/^drafts\./, '')

  const handlePrint = async () => {
    setBusy(true)
    try {
      const base = getNetlifyFnBase().replace(/\/$/, '')
      const pdfUrl = `${base}/.netlify/functions/generateInvoicePDF?invoiceId=${encodeURIComponent(docId)}`
      if (typeof window !== 'undefined') {
        window.open(pdfUrl, '_blank', 'noopener,noreferrer')
      }

      const patchOps = {lastPrintedAt: new Date().toISOString()}
      const tx = client.transaction()
      if (props.published) tx.patch(docId, (patch) => patch.set(patchOps).inc({printCount: 1}))
      if (props.draft) tx.patch(`drafts.${docId}`, (patch) => patch.set(patchOps).inc({printCount: 1}))
      await tx.commit({autoGenerateArrayKeys: true})

      toast.push({status: 'success', title: 'Invoice PDF opened'})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.push({status: 'error', title: 'Failed to open invoice PDF', description: message})
    } finally {
      setBusy(false)
      props.onComplete()
    }
  }

  return {
    label: busy ? 'Opening PDF…' : 'Print / Download PDF',
    tone: 'default',
    disabled: busy,
    onHandle: handlePrint,
  }
}
