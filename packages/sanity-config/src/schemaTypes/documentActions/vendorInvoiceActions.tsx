import {useState} from 'react'
import {Box, Button, Flex, Stack, Text, useToast} from '@sanity/ui'
import type {DocumentActionComponent} from 'sanity'
import type {DocumentStub} from '../../types/sanity'
import {useClient} from 'sanity'
import {generateReferenceCode} from '../../../../../shared/referenceCodes'

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
    process.env.PUBLIC_VENDOR_PORTAL_URL ||
    '').replace(/\/$/, '')

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
