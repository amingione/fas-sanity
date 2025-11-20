// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
// src/schemaTypes/documents/order.tsx
import {defineType} from 'sanity'
import {PackageIcon, DocumentPdfIcon, ResetIcon} from '@sanity/icons'
import type {DocumentActionsResolver} from 'sanity'
import React from 'react'
import {decodeBase64ToArrayBuffer} from '../../utils/base64'
import {formatOrderNumber} from '../../utils/orderNumber'
import OrderNumberInput from '../../components/inputs/OrderNumberInput'
import {getNetlifyFunctionBaseCandidates} from '../../utils/netlifyBase'

// ============================================================================
// CUSTOM FULFILLMENT OVERVIEW COMPONENT
// ============================================================================

const FulfillmentOverview = (props: any) => {
  const {value} = props

  if (!value) return null

  const formatDate = (date?: string) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const customerName = value.customerName || value.shippingAddress?.name || 'Unknown Customer'

  return (
    <div style={{padding: '24px', backgroundColor: '#ffffff'}}>
      {/* Customer Name */}
      <div style={{marginBottom: '24px'}}>
        <div
          style={{
            fontSize: '13px',
            color: '#6b7280',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '8px',
          }}
        >
          Customer
        </div>
        <div style={{fontSize: '24px', fontWeight: '700', color: '#111827'}}>{customerName}</div>
        {value.customerEmail && (
          <div style={{fontSize: '14px', color: '#6b7280', marginTop: '4px'}}>
            {value.customerEmail}
          </div>
        )}
      </div>

      {/* Ordered Items */}
      <div style={{marginBottom: '24px'}}>
        <div
          style={{
            fontSize: '13px',
            color: '#6b7280',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '12px',
          }}
        >
          Ordered Items
        </div>
        {value.cart?.map((item: any, index: number) => (
          <div
            key={index}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              padding: '12px 0',
              borderBottom: index < value.cart.length - 1 ? '1px solid #f3f4f6' : 'none',
            }}
          >
            <div style={{flex: 1}}>
              <div style={{fontSize: '15px', fontWeight: '600', color: '#111827'}}>
                {item.name || item.productName || 'Product'}
              </div>
              {item.sku && (
                <div style={{fontSize: '13px', color: '#6b7280', marginTop: '2px'}}>
                  SKU: {item.sku}
                </div>
              )}
              {item.optionSummary && (
                <div style={{fontSize: '13px', color: '#6b7280', marginTop: '2px'}}>
                  {item.optionSummary}
                </div>
              )}
            </div>
            <div style={{textAlign: 'right', marginLeft: '16px'}}>
              <div style={{fontSize: '15px', fontWeight: '600', color: '#111827'}}>
                Qty: {item.quantity || 1}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Order Date */}
      <div>
        <div
          style={{
            fontSize: '13px',
            color: '#6b7280',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '8px',
          }}
        >
          Order Date
        </div>
        <div style={{fontSize: '16px', fontWeight: '600', color: '#111827'}}>
          {formatDate(value.createdAt)}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ORDER SCHEMA
// ============================================================================

const orderSchema = defineType({
  name: 'order',
  title: 'Order',
  type: 'document',
  icon: PackageIcon,
  initialValue: () => ({
    orderType: 'in-store',
  }),
  groups: [
    {name: 'overview', title: 'Overview'},
    {name: 'customer', title: 'Customer'},
    {name: 'items', title: 'Items', default: true},
    {name: 'shipping', title: 'Shipping'},
    {name: 'payment', title: 'Payment'},
    {name: 'marketing', title: 'Attribution & Marketing'},
    {name: 'advanced', title: 'Advanced'},
  ],
  fields: [
    // ========== OVERVIEW GROUP ==========
    {
      name: 'fulfillmentOverview',
      type: 'object',
      title: 'Fulfillment Overview',
      group: 'overview',
      components: {
        input: FulfillmentOverview,
      },
      fields: [{name: 'placeholder', type: 'string', hidden: true}],
      hidden: ({document}) => !document,
    },
    {
      name: 'orderNumber',
      type: 'string',
      title: 'Order Number',
      group: 'overview',
      // Enforce the formatted, canonical order number display
      readOnly: true,
      components: {input: OrderNumberInput},
    },
    {
      name: 'orderType',
      type: 'string',
      title: 'Order Type',
      group: 'overview',
      options: {
        list: [
          {title: '🛒 Online Order', value: 'online'},
          {title: '🏪 In-Store Order', value: 'in-store'},
          {title: '🏭 Wholesale Order', value: 'wholesale'},
        ],
        layout: 'radio',
      },
      initialValue: 'online',
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'status',
      type: 'string',
      title: 'Order Status',
      group: 'overview',
      options: {
        list: [
          {title: 'Paid', value: 'paid'},
          {title: 'Fulfilled', value: 'fulfilled'},
          {title: 'Shipped', value: 'shipped'},
          {title: 'Cancelled', value: 'cancelled'},
          {title: 'Refunded', value: 'refunded'},
        ],
        layout: 'dropdown',
      },
      readOnly: false,
    },
    {
      name: 'wholesaleWorkflowStatus',
      title: 'Wholesale Workflow Status',
      type: 'string',
      options: {
        list: [
          {title: 'Requested', value: 'requested'},
          {title: 'Awaiting PO', value: 'awaiting_po'},
          {title: 'In Production', value: 'in_production'},
          {title: 'Ready to Ship', value: 'ready_to_ship'},
          {title: 'Delivered', value: 'delivered'},
        ],
      },
      hidden: ({document}) => document?.orderType !== 'wholesale',
      group: 'overview',
    },
    {
      name: 'wholesaleDetails',
      title: 'Wholesale Details',
      type: 'object',
      hidden: ({document}) => document?.orderType !== 'wholesale',
      group: 'overview',
      options: {collapsible: true, collapsed: false},
      fields: [
        {
          name: 'vendor',
          title: 'Vendor',
          type: 'reference',
          to: [{type: 'vendor'}],
        },
        {
          name: 'pricingTier',
          title: 'Pricing Tier',
          type: 'string',
          options: {
            list: [
              {title: 'Standard', value: 'standard'},
              {title: 'Preferred', value: 'preferred'},
              {title: 'Platinum', value: 'platinum'},
            ],
          },
        },
        {
          name: 'bulkQuantity',
          title: 'Bulk Quantity',
          type: 'number',
          validation: (Rule) => Rule.min(1),
        },
        {
          name: 'expectedShipDate',
          title: 'Expected Ship Date',
          type: 'date',
        },
        {
          name: 'paymentTerms',
          title: 'Payment Terms',
          type: 'string',
          options: {
            list: [
              {title: 'Net 30', value: 'net_30'},
              {title: 'Net 60', value: 'net_60'},
              {title: 'Due on Receipt', value: 'due_on_receipt'},
            ],
            layout: 'radio',
          },
        },
        {
          name: 'bulkUnitPrice',
          title: 'Bulk Unit Price',
          type: 'number',
          validation: (Rule) => Rule.min(0),
        },
        {
          name: 'notes',
          title: 'Wholesale Notes',
          type: 'text',
          rows: 3,
        },
      ],
    },
    {
      name: 'inStoreDetails',
      title: 'In-Store Details',
      type: 'object',
      hidden: ({document}) => document?.orderType !== 'in-store',
      group: 'overview',
      options: {collapsible: true, collapsed: false},
      fields: [
        {
          name: 'appointment',
          title: 'Appointment',
          type: 'reference',
          to: [{type: 'appointment'}],
        },
        {
          name: 'workOrder',
          title: 'Work Order',
          type: 'reference',
          to: [{type: 'workOrder'}],
        },
        {
          name: 'bay',
          title: 'Service Bay',
          type: 'string',
          options: {
            list: [
              {title: 'Bay 1', value: 'bay1'},
              {title: 'Bay 2', value: 'bay2'},
              {title: 'Bay 3', value: 'bay3'},
              {title: 'Bay 4', value: 'bay4'},
            ],
          },
        },
        {
          name: 'technician',
          title: 'Technician',
          type: 'string',
        },
      ],
    },
    {
      name: 'createdAt',
      type: 'datetime',
      title: 'Order Date',
      group: 'overview',
      readOnly: true,
    },
    {
      name: 'attribution',
      title: 'Attribution',
      type: 'object',
      group: 'marketing',
      options: {collapsible: true, collapsed: false},
      fields: [
        {name: 'source', type: 'string', title: 'Source', readOnly: true},
        {name: 'medium', type: 'string', title: 'Medium', readOnly: true},
        {name: 'campaign', type: 'string', title: 'Campaign', readOnly: true},
        {name: 'content', type: 'string', title: 'Content', readOnly: true},
        {name: 'term', type: 'string', title: 'Term/Keyword', readOnly: true},
        {name: 'landingPage', type: 'url', title: 'Landing Page', readOnly: true},
        {name: 'referrer', type: 'url', title: 'Referrer', readOnly: true},
        {name: 'capturedAt', type: 'datetime', title: 'Captured At', readOnly: true},
        {name: 'device', type: 'string', title: 'Device', readOnly: true},
        {name: 'browser', type: 'string', title: 'Browser', readOnly: true},
        {name: 'os', type: 'string', title: 'Operating System', readOnly: true},
        {name: 'sessionId', type: 'string', title: 'Session ID', readOnly: true},
        {name: 'touchpoints', type: 'number', title: 'Touchpoints', readOnly: true},
        {name: 'firstTouch', type: 'datetime', title: 'First Touch', readOnly: true},
        {name: 'lastTouch', type: 'datetime', title: 'Last Touch', readOnly: true},
        {
          name: 'campaignRef',
          title: 'Linked Campaign',
          type: 'reference',
          to: [{type: 'shoppingCampaign'}],
          readOnly: true,
        },
      ],
    },

    // ========== CUSTOMER GROUP ==========
    {
      name: 'customerName',
      type: 'string',
      title: 'Customer Name',
      group: 'customer',
      readOnly: false,
    },
    {
      name: 'customerEmail',
      type: 'string',
      title: 'Customer Email',
      group: 'customer',
      readOnly: true,
    },
    {
      name: 'customerRef',
      type: 'reference',
      title: 'Customer Reference',
      to: [{type: 'customer'}],
      group: 'customer',
      readOnly: true,
    },

    // ========== ITEMS GROUP ==========
    {
      name: 'cart',
      type: 'array',
      title: 'Order Items',
      group: 'items',
      readOnly: true,
      of: [
        // Standardize on the global cart item schema
        {type: 'orderCartItem'},
      ],
    },
    {
      name: 'totalAmount',
      type: 'number',
      title: 'Total Amount',
      group: 'items',
      readOnly: true,
    },
    {
      name: 'amountSubtotal',
      type: 'number',
      title: 'Subtotal',
      group: 'items',
      readOnly: true,
    },
    {
      name: 'amountTax',
      type: 'number',
      title: 'Tax',
      group: 'items',
      readOnly: true,
    },
    {
      name: 'amountDiscount',
      type: 'number',
      title: 'Discounts',
      group: 'items',
      readOnly: true,
    },
    {
      name: 'amountShipping',
      type: 'number',
      title: 'Shipping',
      group: 'items',
      readOnly: true,
    },
    // Removed: Order-level FAQ does not belong here

    // ========== SHIPPING GROUP ==========
    {
      name: 'shippingAddress',
      type: 'object',
      title: 'Shipping Address',
      group: 'shipping',
      hidden: ({document}) => document?.orderType !== 'online',
      fields: [
        {name: 'name', type: 'string', title: 'Recipient Name'},
        {name: 'phone', type: 'string', title: 'Phone'},
        {name: 'email', type: 'string', title: 'Email'},
        {name: 'addressLine1', type: 'string', title: 'Address Line 1'},
        {name: 'addressLine2', type: 'string', title: 'Address Line 2'},
        {name: 'city', type: 'string', title: 'City'},
        {name: 'state', type: 'string', title: 'State'},
        {name: 'postalCode', type: 'string', title: 'ZIP Code'},
        {name: 'country', type: 'string', title: 'Country'},
      ],
    },
    {
      name: 'manualTrackingNumber',
      type: 'string',
      title: 'Tracking Number',
      description: 'Add tracking number to mark order as fulfilled',
      group: 'shipping',
      hidden: ({document}) => document?.orderType !== 'online',
    },
    {
      name: 'trackingNumber',
      type: 'string',
      title: 'Tracking Number (Auto)',
      group: 'shipping',
      readOnly: true,
      hidden: ({document}) => document?.orderType !== 'online',
    },
    {
      name: 'trackingUrl',
      type: 'url',
      title: 'Tracking URL',
      group: 'shipping',
      readOnly: true,
      hidden: ({document}) => document?.orderType !== 'online',
    },
    {
      name: 'shippingLabelUrl',
      type: 'url',
      title: 'Shipping Label',
      group: 'shipping',
      readOnly: true,
      hidden: ({document}) => document?.orderType !== 'online',
    },
    {
      name: 'packingSlipUrl',
      type: 'url',
      title: 'Packing Slip',
      group: 'shipping',
      readOnly: true,
      hidden: ({document}) => document?.orderType !== 'online',
    },
    {
      name: 'fulfilledAt',
      type: 'datetime',
      title: 'Fulfilled Date',
      group: 'shipping',
      readOnly: true,
      hidden: ({document}) => document?.orderType !== 'online',
    },

    // ========== PAYMENT GROUP ==========
    {
      name: 'paymentStatus',
      type: 'string',
      title: 'Payment Status',
      group: 'payment',
      readOnly: true,
    },
    {
      name: 'paymentIntentId',
      type: 'string',
      title: 'Payment Intent ID',
      group: 'payment',
      readOnly: true,
    },
    {
      name: 'cardBrand',
      type: 'string',
      title: 'Card Brand',
      group: 'payment',
      readOnly: true,
    },
    {
      name: 'cardLast4',
      type: 'string',
      title: 'Card Last 4',
      group: 'payment',
      readOnly: true,
    },
    {
      name: 'receiptUrl',
      type: 'url',
      title: 'Receipt URL',
      group: 'payment',
      readOnly: true,
    },

    // ========== ADVANCED GROUP ==========
    {
      name: 'stripeSessionId',
      type: 'string',
      title: 'Stripe Session ID',
      group: 'advanced',
      readOnly: true,
    },
    {
      name: 'invoiceRef',
      type: 'reference',
      title: 'Invoice',
      to: [{type: 'invoice'}],
      group: 'advanced',
      readOnly: true,
    },
    {
      name: 'currency',
      type: 'string',
      title: 'Currency',
      group: 'advanced',
      readOnly: true,
    },
  ],
  preview: {
    select: {
      orderNumber: 'orderNumber',
      customerName: 'customerName',
      shippingName: 'shippingAddress.name',
      status: 'status',
      total: 'totalAmount',
    },
    prepare({orderNumber, customerName, shippingName, status, total}) {
      const displayOrderNumber = formatOrderNumber(orderNumber) || orderNumber
      const formattedTotal = total
        ? new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(total)
        : '$0.00'
      const displayName = customerName || shippingName || 'No customer'

      return {
        title: displayOrderNumber || 'Untitled Order',
        subtitle: `${displayName} • ${status || 'unknown'} • ${formattedTotal}`,
      }
    },
  },
})

export default orderSchema

const SANITY_API_VERSION = '2024-10-01'

type NetlifyRequestInit = RequestInit & {json?: unknown}

const normalizeDocumentId = (value?: string | null): string => {
  if (!value) return ''
  return String(value)
    .trim()
    .replace(/^drafts\./, '')
}

const resolvePatchTargets = (rawId?: string | null): string[] => {
  if (!rawId) return []
  const clean = String(rawId).trim()
  if (!clean) return []
  const published = clean.replace(/^drafts\./, '')
  const ids = new Set<string>([clean])
  if (published && published !== clean) {
    ids.add(published)
  }
  return Array.from(ids)
}

const openExternalUrl = (url?: string | null) => {
  if (!url || typeof window === 'undefined') return
  try {
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch {
    window.location.href = url
  }
}

const confirmAction = (message: string) => {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true
  return window.confirm(message)
}

const filenameSafe = (value?: string | null, fallback = 'order') => {
  const base = (value ?? fallback ?? 'order').toString().trim()
  const normalized = base
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || fallback || 'order'
}

const asOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

const readResponseMessage = async (response: Response) => {
  try {
    const data = await response.clone().json()
    if (data && typeof data === 'object') {
      if (typeof (data as any).error === 'string') return (data as any).error
      if (typeof (data as any).message === 'string') return (data as any).message
    }
  } catch {
    // fall through to text parsing
  }

  try {
    const text = await response.text()
    if (text) return text
  } catch {
    // ignore
  }

  return `Request failed (HTTP ${response.status})`
}

const responseToPdfBlob = async (response: Response): Promise<Blob> => {
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('application/pdf')) {
    const buffer = await response.arrayBuffer()
    return new Blob([buffer], {type: 'application/pdf'})
  }
  const base64 = (await response.text()).replace(/^"|"$/g, '')
  const buffer = decodeBase64ToArrayBuffer(base64)
  return new Blob([buffer], {type: 'application/pdf'})
}

const parseCurrencyAmount = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

const callNetlifyFunction = async (
  fnName: string,
  init: NetlifyRequestInit = {},
): Promise<Response> => {
  const {json, ...rest} = init
  const body =
    rest.body !== undefined ? rest.body : json !== undefined ? JSON.stringify(json) : undefined

  const baseHeaders = new Headers(rest.headers || undefined)
  if (body && !baseHeaders.has('Content-Type') && typeof body === 'string') {
    baseHeaders.set('Content-Type', 'application/json')
  }

  const bases = getNetlifyFunctionBaseCandidates()
  let lastError: unknown = null

  for (const base of bases) {
    const url = `${base}/.netlify/functions/${fnName}`
    try {
      const response = await fetch(url, {
        ...rest,
        method: rest.method ?? 'POST',
        headers: new Headers(baseHeaders),
        body,
      })

      if (response.status === 404) {
        lastError = new Error(`${fnName} not available at ${base}`)
        continue
      }

      if (response.ok && typeof window !== 'undefined') {
        try {
          window.localStorage?.setItem('NLFY_BASE', base)
        } catch {
          // ignore storage failures
        }
      }

      return response
    } catch (error) {
      lastError = error
    }
  }

  throw lastError ?? new Error('Unable to reach Netlify functions')
}

// ============================================================================
// DOCUMENT ACTIONS
// ============================================================================

export const orderActions: DocumentActionsResolver = (prev, context) => {
  const {schemaType} = context

  if (schemaType !== 'order') {
    return prev
  }

  return [
    ...prev,

    // Print Packing Slip
    (props) => {
      const {id, draft, published} = props
      const doc = draft || published

      return {
        label: 'Print Packing Slip',
        icon: DocumentPdfIcon,
        tone: 'primary',
        disabled: !doc,
        onHandle: async () => {
          if (!doc) return

          const savedUrl = typeof doc.packingSlipUrl === 'string' ? doc.packingSlipUrl.trim() : ''
          if (savedUrl) {
            openExternalUrl(savedUrl)
            props.onComplete()
            return
          }

          const orderId = normalizeDocumentId(doc._id || id)
          const invoiceId = normalizeDocumentId(
            (doc?.invoiceRef as {_ref?: string} | undefined)?._ref,
          )
          const orderNumberValue = asOptionalString(doc?.orderNumber)
          if (!orderId && !invoiceId) {
            alert('Publish the order or link an invoice before generating a packing slip.')
            props.onComplete()
            return
          }

          const payload: Record<string, string> = {}
          if (orderId) payload.orderId = orderId
          if (invoiceId) payload.invoiceId = invoiceId
          const patchTargets = resolvePatchTargets(id)

          try {
            const response = await callNetlifyFunction('generatePackingSlips', {
              json: payload,
            })

            if (!response.ok) {
              const message = await readResponseMessage(response)
              throw new Error(message)
            }

            const pdfBlob = await responseToPdfBlob(response)
            const client = context.getClient({apiVersion: SANITY_API_VERSION})
            let targetUrl: string | null = null

            try {
              const asset = await client.assets.upload('file', pdfBlob, {
                filename: `packing-slip-${filenameSafe(orderNumberValue || orderId || undefined)}.pdf`,
                contentType: 'application/pdf',
              })
              if ((asset as any)?.url) {
                targetUrl = (asset as any).url
                for (const targetId of patchTargets) {
                  try {
                    await client
                      .patch(targetId)
                      .set({packingSlipUrl: targetUrl})
                      .commit({autoGenerateArrayKeys: true})
                  } catch (patchErr: any) {
                    if (patchErr?.statusCode !== 404) {
                      throw patchErr
                    }
                  }
                }
              }
            } catch (uploadErr) {
              console.warn('Packing slip upload failed', uploadErr)
            }

            if (!targetUrl) {
              const objectUrl = URL.createObjectURL(pdfBlob)
              targetUrl = objectUrl
              setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
            }

            openExternalUrl(targetUrl)
          } catch (error: any) {
            console.error('Error generating packing slip:', error)
            alert(error?.message || 'Unable to generate packing slip')
          } finally {
            props.onComplete()
          }
        },
      }
    },

    // Add Tracking
    (props) => {
      const {id, draft, published} = props
      const doc = draft || published

      return {
        label: 'Add Tracking',
        icon: PackageIcon,
        tone: 'primary',
        disabled: !doc || doc?.status === 'cancelled',
        onHandle: async () => {
          if (!doc) return

          const trackingNumber = prompt('Enter tracking number:')
          const normalized = trackingNumber?.trim()
          if (!normalized) return

          const client = context.getClient({apiVersion: SANITY_API_VERSION})
          const patchTargets = resolvePatchTargets(id)

          try {
            for (const targetId of patchTargets) {
              try {
                await client
                  .patch(targetId)
                  .set({
                    manualTrackingNumber: normalized,
                    trackingNumber: normalized,
                  })
                  .commit({autoGenerateArrayKeys: true})
              } catch (patchErr: any) {
                if (patchErr?.statusCode !== 404) {
                  throw patchErr
                }
              }
            }
            alert('Tracking number saved.')
          } catch (error) {
            console.error('Error adding tracking:', error)
            alert('Failed to add tracking number')
          } finally {
            props.onComplete()
          }
        },
      }
    },

    // Create Shipping Label
    (props) => {
      const {id, draft, published} = props
      const doc = draft || published

      return {
        label: 'Create Label',
        icon: PackageIcon,
        tone: 'primary',
        disabled: !doc || !doc?.shippingAddress || doc?.status === 'cancelled',
        onHandle: async () => {
          if (!doc) return

          const orderId = normalizeDocumentId(doc._id || id)
          if (!orderId) {
            alert('Publish the order before creating a label.')
            props.onComplete()
            return
          }

          try {
            const response = await callNetlifyFunction('easypostCreateLabel', {
              json: {orderId},
            })

            let payload: any = null
            try {
              payload = await response.clone().json()
            } catch {
              payload = null
            }

            if (!response.ok || (payload && payload.error)) {
              const message =
                (payload && (payload.error || payload.message)) ||
                (await readResponseMessage(response))
              throw new Error(message)
            }

            const labelUrl =
              typeof payload?.labelUrl === 'string' ? payload.labelUrl.trim() : undefined
            const trackingUrl =
              typeof payload?.trackingUrl === 'string' ? payload.trackingUrl.trim() : undefined
            const trackingNumber =
              typeof payload?.trackingNumber === 'string'
                ? payload.trackingNumber.trim()
                : undefined

            const updates: Record<string, any> = {}
            if (labelUrl) updates.shippingLabelUrl = labelUrl
            if (trackingUrl) updates.trackingUrl = trackingUrl
            if (trackingNumber) updates.trackingNumber = trackingNumber

            if (Object.keys(updates).length > 0) {
              const client = context.getClient({apiVersion: SANITY_API_VERSION})
              const patchTargets = resolvePatchTargets(id)
              for (const targetId of patchTargets) {
                try {
                  await client.patch(targetId).set(updates).commit({autoGenerateArrayKeys: true})
                } catch (patchErr: any) {
                  if (patchErr?.statusCode !== 404) {
                    throw patchErr
                  }
                }
              }
            }

            if (labelUrl || trackingUrl) {
              openExternalUrl(labelUrl || trackingUrl)
            }

            alert('Shipping label created via EasyPost.')
          } catch (error) {
            console.error('Error creating shipping label:', error)
            alert((error as Error)?.message || 'Failed to create shipping label')
          } finally {
            props.onComplete()
          }
        },
      }
    },

    // Mark as Fulfilled
    (props) => {
      const {id, draft, published} = props
      const doc = draft || published

      return {
        label: 'Mark Fulfilled',
        icon: PackageIcon,
        tone: 'positive',
        disabled:
          !doc ||
          doc?.status === 'fulfilled' ||
          doc?.status === 'shipped' ||
          doc?.status === 'cancelled',
        onHandle: async () => {
          if (!doc) return

          if (!confirmAction('Mark this order as fulfilled?')) {
            return
          }

          const orderId = normalizeDocumentId(doc._id || id)
          if (!orderId) {
            alert('Publish the order before marking it fulfilled.')
            props.onComplete()
            return
          }

          try {
            const response = await callNetlifyFunction('fulfill-order', {
              json: {orderId, markOnly: true},
            })

            let payload: any = null
            try {
              payload = await response.clone().json()
            } catch {
              payload = null
            }

            if (!response.ok || (payload && payload.success === false)) {
              const message =
                (payload && (payload.message || payload.error)) ||
                (await readResponseMessage(response))
              throw new Error(message)
            }

            const updates = {
              status: 'fulfilled',
              fulfilledAt: payload?.fulfilledAt || new Date().toISOString(),
            }

            const client = context.getClient({apiVersion: SANITY_API_VERSION})
            const patchTargets = resolvePatchTargets(id)
            for (const targetId of patchTargets) {
              try {
                await client.patch(targetId).set(updates).commit({autoGenerateArrayKeys: true})
              } catch (patchErr: any) {
                if (patchErr?.statusCode !== 404) {
                  throw patchErr
                }
              }
            }

            alert('Order marked as fulfilled.')
          } catch (error) {
            console.error('Error marking as fulfilled:', error)
            alert((error as Error)?.message || 'Error updating order')
          } finally {
            props.onComplete()
          }
        },
      }
    },

    // Refund in Stripe
    (props) => {
      const {id, draft, published} = props
      const doc = draft || published

      return {
        label: 'Refund in Stripe',
        icon: ResetIcon,
        tone: 'critical',
        disabled:
          !doc ||
          !doc?.paymentIntentId ||
          doc?.status === 'refunded' ||
          doc?.status === 'cancelled',
        onHandle: async () => {
          if (!doc || !doc.paymentIntentId) return

          const orderTotal = parseCurrencyAmount(doc.totalAmount)
          const amountInput = prompt(
            `Enter refund amount (max: $${orderTotal.toFixed(2)}):`,
            orderTotal > 0 ? orderTotal.toFixed(2) : '',
          )
          if (!amountInput) return

          const refundAmount = parseFloat(amountInput)
          if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
            alert('Invalid refund amount')
            return
          }

          if (orderTotal > 0 && refundAmount - orderTotal > 0.001) {
            alert(`Refund amount cannot exceed order total of $${orderTotal.toFixed(2)}`)
            return
          }

          const reasonInput = prompt('Refund reason (optional):')
          const reason = reasonInput ? reasonInput.trim() : undefined

          if (!confirmAction(`Refund $${refundAmount.toFixed(2)} to customer?`)) {
            return
          }

          const orderId = normalizeDocumentId(doc._id || id)
          if (!orderId) {
            alert('Publish the order before processing refunds.')
            return
          }

          const amountCents = Math.round(refundAmount * 100)

          try {
            const response = await callNetlifyFunction('createRefund', {
              json: {
                orderId,
                amount: refundAmount,
                amountCents,
                reason,
              },
            })

            let payload: any = null
            try {
              payload = await response.clone().json()
            } catch {
              payload = null
            }

            if (!response.ok || (payload && payload.error)) {
              const message =
                (payload && (payload.error || payload.message)) ||
                (await readResponseMessage(response))
              throw new Error(message)
            }

            alert('Refund processed successfully!')
          } catch (error) {
            console.error('Error processing refund:', error)
            alert((error as Error)?.message || 'Error processing refund')
          } finally {
            props.onComplete()
          }
        },
      }
    },
  ]
}
