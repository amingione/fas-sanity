// src/schemaTypes/documents/order.actions.ts
import {
  DocumentIcon,
  PackageIcon,
  ResetIcon,
  TrashIcon,
  WarningOutlineIcon,
} from '@sanity/icons'
import type {DocumentActionsResolver} from 'sanity'
import {getNetlifyFunctionBaseCandidates} from '../../utils/netlifyBase'

const SANITY_API_VERSION = '2024-10-01'
const ORDER_DOCUMENT_TYPES = new Set(['order'])
const FULFILLABLE_STATUSES = new Set(['paid'])
const NON_CANCELABLE_STATUSES = new Set([
  'fulfilled',
  'shipped',
  'delivered',
  'canceled',
  'cancelled',
  'refunded',
])
const REFUNDABLE_STATUSES = new Set(['fulfilled', 'shipped', 'delivered'])

const normalizeId = (val?: string | null) =>
  val
    ? String(val)
        .trim()
        .replace(/^drafts\./, '')
    : ''

const resolveTargets = (id?: string | null) => {
  if (!id) return []
  const clean = id.replace(/^drafts\./, '')
  return clean ? Array.from(new Set([id, clean])) : [id]
}

const readResponseMessage = async (res: Response) => {
  try {
    const json = await res.clone().json()
    if (json?.message) return json.message
    if (json?.error) return json.error
  } catch {
    // ignore JSON parse failures
  }
  try {
    const text = await res.text()
    if (text) return text
  } catch {
    // ignore text parse failures
  }
  return `Request failed (${res.status})`
}

const callFn = async (fn: string, json?: unknown) => {
  const bases = getNetlifyFunctionBaseCandidates()
  let lastErr: unknown = null

  for (const base of bases) {
    try {
      const res = await fetch(`${base}/.netlify/functions/${fn}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: json ? JSON.stringify(json) : undefined,
      })
      if (res.status === 404) {
        lastErr = new Error(`${fn} not found at ${base}`)
        continue
      }
      return res
    } catch (err) {
      lastErr = err
    }
  }

  throw lastErr ?? new Error(`Unable to call ${fn}`)
}

const detachInvoiceReferences = async (client: any, orderId: string) => {
  try {
    const invoices: string[] =
      (await client.fetch(
        `array::compact(*[_type == "invoice" && orderRef._ref == $id]._id)`,
        {id: orderId},
      )) || []
    await Promise.all(
      invoices.map((invoiceId) =>
        client.patch(invoiceId).unset(['orderRef']).commit({autoGenerateArrayKeys: true}),
      ),
    )
  } catch (err) {
    console.warn('order.delete: failed detaching invoice references', err)
  }
}

// ---------------------------
// ORDER ACTIONS
// ---------------------------
export const orderActions: DocumentActionsResolver = (prev, context) => {
  const {schemaType, getClient} = context
  if (!ORDER_DOCUMENT_TYPES.has(schemaType)) return prev

  return [
    ...prev,
    // Fulfill order: creates shipment, buys label, emails customer.
    (props) => {
      const doc = props.draft || props.published
      if (!doc) return null
      const status = typeof doc.status === 'string' ? doc.status : ''
      const eligible = FULFILLABLE_STATUSES.has(status)
      return {
        name: 'fulfillOrder',
        label: 'Fulfill Order',
        icon: PackageIcon,
        tone: 'primary',
        title: eligible ? undefined : 'Order must be paid before fulfillment.',
        disabled: !eligible,
        hidden: !eligible,
        onHandle: async () => {
          const orderId = normalizeId(doc._id)
          if (!orderId) {
            alert('Publish this order before fulfilling it.')
            props.onComplete()
            return
          }

          try {
            const res = await callFn('fulfillOrder', {orderId})
            const data = await res.clone().json().catch(() => null)
            if (!res.ok || data?.error) {
              throw new Error(data?.error || (await readResponseMessage(res)))
            }

            if (data?.labelUrl && typeof window !== 'undefined') {
              try {
                window.open(data.labelUrl, '_blank', 'noopener')
              } catch {
                window.location.href = data.labelUrl
              }
            }

            alert('Order fulfilled and customer notified.')
          } catch (error: any) {
            console.error('fulfillOrder action failed', error)
            alert(error?.message || 'Unable to fulfill order')
          } finally {
            props.onComplete()
          }
        },
      }
    },

    // Cancel order before it ships.
    (props) => {
      const doc = props.draft || props.published
      if (!doc) return null
      const status = typeof doc.status === 'string' ? doc.status : ''
      const disableCancel = !status || NON_CANCELABLE_STATUSES.has(status)

      return {
        name: 'cancelOrder',
        label: 'Cancel Order',
        icon: TrashIcon,
        tone: 'critical',
        title: disableCancel ? 'Only paid orders can be cancelled. Use Refund for shipped orders.' : undefined,
        disabled: disableCancel,
        hidden: disableCancel,
        onHandle: async () => {
          if (
            !window.confirm(
              'Cancel this order?\n\nThis will void fulfillment, maintain the invoice for records, and release inventory.',
            )
          ) {
            props.onComplete()
            return
          }

          try {
            const orderId = normalizeId(doc._id)
            const res = await callFn('cancelOrder', {orderId})
            if (!res.ok) throw new Error(await readResponseMessage(res))
            alert('Order cancelled.')
          } catch (error: any) {
            console.error('cancelOrder action failed', error)
            alert(error?.message || 'Unable to cancel order')
          } finally {
            props.onComplete()
          }
        },
      }
    },

    // Refund shipped orders.
    (props) => {
      const doc = props.draft || props.published
      if (!doc) return null
      const status = typeof doc.status === 'string' ? doc.status : ''
      const paymentIntentId =
        typeof doc.paymentIntentId === 'string'
          ? doc.paymentIntentId
          : typeof (doc as any)?.stripePaymentIntentId === 'string'
            ? (doc as any).stripePaymentIntentId
            : ''
      if (!paymentIntentId) return null
      const allowRefund = REFUNDABLE_STATUSES.has(status)

      return {
        name: 'refundOrder',
        label: 'Refund Order',
        icon: ResetIcon,
        tone: 'critical',
        title: allowRefund ? undefined : 'Only shipped or delivered orders can be refunded.',
        disabled: !allowRefund,
        hidden: !allowRefund,
        onHandle: async () => {
          if (
            !window.confirm(
              'Refund this order?\n\nStripe will refund the payment and any existing shipment will be cancelled.',
            )
          ) {
            props.onComplete()
            return
          }

          try {
            const res = await callFn('refundOrder', {orderId: normalizeId(doc._id)})
            const data = await res.clone().json().catch(() => null)
            if (!res.ok || data?.error) {
              throw new Error(data?.error || (await readResponseMessage(res)))
            }
            alert('Order refunded.')
          } catch (error: any) {
            console.error('refundOrder action failed', error)
            alert(error?.message || 'Unable to refund order')
          } finally {
            props.onComplete()
          }
        },
      }
    },

    // View invoice shortcut.
    (props) => {
      const doc = props.draft || props.published
      const invoiceData = doc?.invoiceData || {}
      const invoiceUrl = typeof invoiceData?.invoiceUrl === 'string' ? invoiceData.invoiceUrl : ''
      const invoiceId = typeof invoiceData?.invoiceId === 'string' ? invoiceData.invoiceId : ''
      const legacyRef =
        typeof (doc as any)?.invoiceRef?._ref === 'string' ? (doc as any).invoiceRef._ref : ''
      if (!invoiceUrl && !invoiceId && !legacyRef) return null

      return {
        name: 'viewInvoice',
        label: 'View Invoice',
        icon: DocumentIcon,
        onHandle: () => {
          if (invoiceUrl) {
            try {
              window.open(invoiceUrl, '_blank', 'noopener')
            } catch {
              window.location.href = invoiceUrl
            }
          } else {
            const normalized = normalizeId(invoiceId || legacyRef)
            if (normalized && typeof window !== 'undefined') {
              window.location.hash = `#/desk/invoice;${normalized}`
            }
          }
          props.onComplete()
        },
      }
    },

    // Delete order (with confirmation).
    (props) => {
      const doc = props.draft || props.published
      if (!doc) return null
      const targets = resolveTargets(doc._id || props.id)
      if (!targets.length) return null

      return {
        name: 'deleteOrder',
        label: 'Delete Order',
        icon: WarningOutlineIcon,
        tone: 'critical',
        hidden: !['canceled', 'cancelled', 'refunded'].includes(
          typeof (doc as any)?.status === 'string' ? (doc as any).status : '',
        ),
        onHandle: async () => {
          const confirmed = window.confirm(
            'Delete this order?\n\nThis will:\n• Keep the invoice for records\n• Keep the customer profile\n• Remove the order permanently\n\nContinue?',
          )
          if (!confirmed) {
            props.onComplete()
            return
          }

          try {
            const client = getClient({apiVersion: SANITY_API_VERSION})
            const orderId = normalizeId(doc._id)
            if (orderId) {
              await detachInvoiceReferences(client, orderId)
            }
            await Promise.all(
              targets.map(async (target) => {
                try {
                  await client.delete(target)
                } catch (error: any) {
                  const status = error?.statusCode || error?.response?.statusCode
                  if (status && status !== 404) throw error
                }
              }),
            )
            alert('Order deleted.')
          } catch (error: any) {
            console.error('deleteOrder action failed', error)
            alert(error?.message || 'Unable to delete order')
          } finally {
            props.onComplete()
          }
        },
      }
    },
  ]
}
