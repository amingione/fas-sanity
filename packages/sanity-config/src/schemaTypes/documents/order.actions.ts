// src/schemaTypes/documents/order.actions.ts
import {
  DocumentPdfIcon,
  PackageIcon,
  ResetIcon,
  CheckmarkCircleIcon,
  CopyIcon,
  TrashIcon,
  EnvelopeIcon,
} from '@sanity/icons'
import type {DocumentActionsResolver} from 'sanity'
import {decodeBase64ToArrayBuffer} from '../../utils/base64'
import {getNetlifyFunctionBaseCandidates} from '../../utils/netlifyBase'

const SANITY_API_VERSION = '2024-10-01'
const ORDER_DOCUMENT_TYPES = new Set(['order'])

// ---------------------------
// Utility helpers
// ---------------------------
const normalizeId = (val?: string | null) =>
  val
    ? String(val)
        .trim()
        .replace(/^drafts\./, '')
    : ''

const resolveTargets = (id?: string | null) => {
  if (!id) return []
  const clean = id.replace(/^drafts\./, '')
  return [id, clean]
}

const readResponseMessage = async (res: Response) => {
  try {
    const j = await res.clone().json()
    if (j?.message) return j.message
    if (j?.error) return j.error
  } catch {}
  try {
    const t = await res.text()
    if (t) return t
  } catch {}
  return `Request failed (${res.status})`
}

const callFn = async (fn: string, json?: unknown) => {
  const bases = getNetlifyFunctionBaseCandidates()
  let lastErr: any = null

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
    } catch (e) {
      lastErr = e
    }
  }

  throw lastErr
}

// ---------------------------
// ORDER ACTIONS
// ---------------------------
export const orderActions: DocumentActionsResolver = (prev, context) => {
  const {schemaType, getClient} = context
  if (!ORDER_DOCUMENT_TYPES.has(schemaType)) return prev

  const flags = (doc: any) => ({
    tracking: doc?.trackingNumber || null,
    labelUrl: doc?.shippingLabelUrl || null,
    isFulfilled: ['fulfilled', 'shipped'].includes(doc?.status),
  })

  return [
    ...prev,

    // ---------------------------
    // MESSAGE VENDOR
    // ---------------------------
    (props) => {
      const doc = props.draft || props.published
      if (!doc || doc.orderType !== 'wholesale') return null

      const vendor = (doc?.wholesaleDetails as any)?.vendor?._ref
      const orderId = normalizeId(doc?._id)
      if (!vendor) return null

      return {
        name: 'messageVendor',
        label: 'Message Vendor',
        icon: EnvelopeIcon,
        onHandle: async () => {
          try {
            const client = getClient({apiVersion: SANITY_API_VERSION})
            const msg = await client.create({
              _type: 'vendorMessage',
              vendor: {_type: 'reference', _ref: vendor},
              subject: `Order ${doc.orderNumber}`,
              status: 'open',
              priority: 'normal',
              category: 'order',
              relatedOrder: {_type: 'reference', _ref: orderId},
            })
            window.location.hash = `#/desk/vendorMessage;${msg._id}`
          } catch {
            alert('Unable to create vendor message.')
          }
          props.onComplete()
        },
      }
    },

    // ---------------------------
    // APPROVE WHOLESALE ORDER
    // ---------------------------
    (props) => {
      const doc = props.draft || props.published
      if (!doc || doc.orderType !== 'wholesale') return null
      if (doc.wholesaleWorkflowStatus !== 'pending') return null

      return {
        name: 'approveWholesale',
        label: 'Approve Order',
        icon: CheckmarkCircleIcon,
        tone: 'positive',
        onHandle: async () => {
          try {
            const orderId = normalizeId(doc._id)
            const res = await callFn('create-wholesale-payment-link', {orderId})
            const data = await res
              .clone()
              .json()
              .catch(() => null)
            if (!res.ok || data?.error)
              throw new Error(data?.error || (await readResponseMessage(res)))

            const client = getClient({apiVersion: SANITY_API_VERSION})
            await client
              .patch(orderId)
              .set({
                wholesaleWorkflowStatus: 'approved',
                'wholesaleDetails.paymentLinkId': data.paymentLinkId || null,
              })
              .commit()

            alert('Order approved.')
          } catch (e: any) {
            alert(e.message || 'Unable to approve order.')
          }
          props.onComplete()
        },
      }
    },

    // ---------------------------
    // CREATE / VIEW LABEL
    // ---------------------------
    (props) => {
      const doc = props.draft || props.published
      const f = flags(doc)
      if (!doc) return null

      return {
        name: 'createLabel',
        label: f.labelUrl ? 'View Label' : 'Create Label',
        icon: PackageIcon,
        tone: f.labelUrl ? 'default' : 'primary',
        onHandle: async () => {
          if (f.labelUrl) {
            window.open(f.labelUrl, '_blank')
            props.onComplete()
            return
          }

          try {
            const orderId = normalizeId(doc._id)
            const res = await callFn('easypostCreateLabel', {orderId})
            const data = await res
              .clone()
              .json()
              .catch(() => null)
            if (!res.ok || data?.error)
              throw new Error(data?.error || (await readResponseMessage(res)))

            const url = data.labelUrl || data.labelAssetUrl
            const client = getClient({apiVersion: SANITY_API_VERSION})

            await client
              .patch(orderId)
              .set({
                shippingLabelUrl: url || null,
                trackingNumber: data.trackingNumber || null,
                trackingUrl: data.trackingUrl || null,
                easyPostShipmentId: data.shipmentId || null,
                easyPostTrackerId: data.trackerId || null,
                status: data.trackingNumber ? 'shipped' : doc.status,
              })
              .commit()

            if (url) window.open(url, '_blank')
            alert('Label created.')
          } catch (e: any) {
            alert(e.message || 'Unable to create label.')
          }

          props.onComplete()
        },
      }
    },

    // ---------------------------
    // ADD / EDIT TRACKING
    // ---------------------------
    (props) => {
      const doc = props.draft || props.published
      const f = flags(doc)
      if (!doc) return null

      return {
        name: 'addTracking',
        label: f.tracking ? 'Edit Tracking' : 'Add Tracking',
        icon: PackageIcon,
        onHandle: async () => {
          const tn = prompt('Enter tracking number:', f.tracking || '')?.trim()
          if (!tn) {
            props.onComplete()
            return
          }

          try {
            const orderId = normalizeId(doc._id)
            const client = getClient({apiVersion: SANITY_API_VERSION})
            await client
              .patch(orderId)
              .set({
                trackingNumber: tn,
                status: 'shipped',
              })
              .commit()
            alert('Tracking saved.')
          } catch {
            alert('Unable to save tracking.')
          }
          props.onComplete()
        },
      }
    },

    // ---------------------------
    // MARK FULFILLED / UNFULFILLED
    // ---------------------------
    (props) => {
      const doc = props.draft || props.published
      const f = flags(doc)
      if (!doc) return null

      return {
        name: 'markFulfilled',
        label: f.isFulfilled ? 'Mark Unfulfilled' : 'Mark Fulfilled',
        icon: CheckmarkCircleIcon,
        tone: f.isFulfilled ? 'caution' : 'positive',
        onHandle: async () => {
          const next = f.isFulfilled ? 'paid' : 'fulfilled'
          try {
            const orderId = normalizeId(doc._id)
            const client = getClient({apiVersion: SANITY_API_VERSION})
            await client
              .patch(orderId)
              .set({
                status: next,
              })
              .commit()
            alert(`Order marked ${next}.`)
          } catch {
            alert('Failed to update fulfill status.')
          }
          props.onComplete()
        },
      }
    },

    // ---------------------------
    // PRINT PACKING SLIP
    // ---------------------------
    (props) => {
      const doc = props.draft || props.published
      if (!doc) return null

      return {
        name: 'packingSlip',
        label: 'Print Packing Slip',
        icon: DocumentPdfIcon,
        onHandle: async () => {
          try {
            const orderId = normalizeId(doc._id)
            const res = await callFn('generatePackingSlips', {orderId})

            if (!res.ok) {
              const msg = await readResponseMessage(res)
              throw new Error(msg)
            }

            const blob = new Blob([await res.arrayBuffer()], {type: 'application/pdf'})
            const url = URL.createObjectURL(blob)
            window.open(url, '_blank')
            setTimeout(() => URL.revokeObjectURL(url), 60000)
          } catch (e: any) {
            alert(e.message || 'Unable to generate packing slip.')
          }

          props.onComplete()
        },
      }
    },

    // ---------------------------
    // REFUND IN STRIPE
    // ---------------------------
    (props) => {
      const doc = props.draft || props.published
      if (!doc || !doc.paymentIntentId) return null
      if (['refunded', 'cancelled'].includes(String(doc.status))) return null

      return {
        name: 'refundStripe',
        label: 'Refund in Stripe',
        icon: ResetIcon,
        tone: 'critical',
        onHandle: async () => {
          const amt = prompt('Refund amount:', String(doc.totalAmount || ''))?.trim()
          if (!amt) return props.onComplete()

          const amount = Number(amt)
          const orderId = normalizeId(doc._id)

          try {
            const res = await callFn('createRefund', {
              orderId,
              amount,
              amountCents: Math.round(amount * 100),
            })
            if (!res.ok) throw new Error(await readResponseMessage(res))
            alert('Refund processed.')
          } catch (e: any) {
            alert(e.message || 'Unable to process refund.')
          }

          props.onComplete()
        },
      }
    },

    // ---------------------------
    // DUPLICATE ORDER
    // ---------------------------
    (props) => {
      const doc = props.draft || props.published
      if (!doc) return null

      return {
        name: 'duplicate',
        label: 'Duplicate Order',
        icon: CopyIcon,
        onHandle: async () => {
          try {
            const client = getClient({apiVersion: SANITY_API_VERSION})
            const {_id, _rev, _createdAt, _updatedAt, _type, ...rest} = doc
            await client.create({
              _type: 'order',
              ...rest,
              orderNumber: `${doc.orderNumber}-copy`,
            })
            alert('Order duplicated.')
          } catch {
            alert('Unable to duplicate order.')
          }
          props.onComplete()
        },
      }
    },

    // ---------------------------
    // CANCEL ORDER
    // ---------------------------
    (props) => {
      const doc = props.draft || props.published
      if (!doc) return null

      return {
        name: 'cancelOrder',
        label: 'Cancel Order',
        icon: TrashIcon,
        tone: 'critical',
        onHandle: async () => {
          if (!confirm('Cancel this order?')) return props.onComplete()

          try {
            const orderId = normalizeId(doc._id)
            const res = await callFn('cancelOrder', {
              orderId,
              orderNumber: doc.orderNumber,
              stripePaymentIntentId: doc.paymentIntentId,
            })
            if (!res.ok) throw new Error(await readResponseMessage(res))
            alert('Order cancelled.')
          } catch (e: any) {
            alert(e.message || 'Unable to cancel order.')
          }

          props.onComplete()
        },
      }
    },
  ]
}
