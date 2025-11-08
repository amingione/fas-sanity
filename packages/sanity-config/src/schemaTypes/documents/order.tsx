// src/schemaTypes/documents/order.tsx
import {defineType} from 'sanity'
import {PackageIcon, DocumentPdfIcon} from '@sanity/icons'
import type {DocumentActionsResolver} from 'sanity'
import React from 'react'

// ============================================================================
// CUSTOM FULFILLMENT OVERVIEW COMPONENT
// ============================================================================

const FulfillmentOverview = (props: any) => {
  const {value} = props

  if (!value) return null

  const formatCurrency = (amount?: number) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const formatDate = (date?: string) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'paid':
        return '#10b981'
      case 'fulfilled':
        return '#3b82f6'
      case 'shipped':
        return '#8b5cf6'
      case 'cancelled':
        return '#ef4444'
      default:
        return '#6b7280'
    }
  }

  return (
    <div style={{padding: '20px', backgroundColor: '#f9fafb', borderRadius: '8px'}}>
      {/* Header */}
      <div
        style={{
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h2 style={{margin: 0, fontSize: '24px', fontWeight: 'bold'}}>
            Order {value.orderNumber}
          </h2>
          <p style={{margin: '4px 0 0', color: '#6b7280', fontSize: '14px'}}>
            {formatDate(value.createdAt)}
          </p>
        </div>
        <div
          style={{
            padding: '6px 16px',
            backgroundColor: getStatusColor(value.status),
            color: 'white',
            borderRadius: '20px',
            fontWeight: '600',
            textTransform: 'uppercase',
            fontSize: '12px',
          }}
        >
          {value.status || 'Unknown'}
        </div>
      </div>

      {/* Customer Info */}
      <div
        style={{
          backgroundColor: 'white',
          padding: '16px',
          borderRadius: '6px',
          marginBottom: '16px',
          border: '1px solid #e5e7eb',
        }}
      >
        <h3 style={{margin: '0 0 12px', fontSize: '16px', fontWeight: '600'}}>Customer</h3>
        <div
          style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px'}}
        >
          <div>
            <strong>Name:</strong> {value.customerName || 'N/A'}
          </div>
          <div>
            <strong>Email:</strong> {value.customerEmail || 'N/A'}
          </div>
        </div>
      </div>

      {/* Shipping Address */}
      {value.shippingAddress && (
        <div
          style={{
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '6px',
            marginBottom: '16px',
            border: '1px solid #e5e7eb',
          }}
        >
          <h3 style={{margin: '0 0 12px', fontSize: '16px', fontWeight: '600'}}>Ship To</h3>
          <div style={{fontSize: '14px', lineHeight: '1.6'}}>
            <div>
              <strong>{value.shippingAddress.name}</strong>
            </div>
            <div>{value.shippingAddress.addressLine1}</div>
            {value.shippingAddress.addressLine2 && <div>{value.shippingAddress.addressLine2}</div>}
            <div>
              {value.shippingAddress.city}, {value.shippingAddress.state}{' '}
              {value.shippingAddress.postalCode}
            </div>
            {value.shippingAddress.phone && <div>Phone: {value.shippingAddress.phone}</div>}
          </div>
        </div>
      )}

      {/* Order Items */}
      <div
        style={{
          backgroundColor: 'white',
          padding: '16px',
          borderRadius: '6px',
          marginBottom: '16px',
          border: '1px solid #e5e7eb',
        }}
      >
        <h3 style={{margin: '0 0 12px', fontSize: '16px', fontWeight: '600'}}>Items to Ship</h3>
        <table style={{width: '100%', fontSize: '14px', borderCollapse: 'collapse'}}>
          <thead>
            <tr style={{borderBottom: '2px solid #e5e7eb', textAlign: 'left'}}>
              <th style={{padding: '8px 0', fontWeight: '600'}}>Product</th>
              <th style={{padding: '8px 0', fontWeight: '600', textAlign: 'center'}}>SKU</th>
              <th style={{padding: '8px 0', fontWeight: '600', textAlign: 'center'}}>Qty</th>
              <th style={{padding: '8px 0', fontWeight: '600', textAlign: 'right'}}>Price</th>
              <th style={{padding: '8px 0', fontWeight: '600', textAlign: 'right'}}>Total</th>
            </tr>
          </thead>
          <tbody>
            {value.cart?.map((item: any, index: number) => (
              <tr key={index} style={{borderBottom: '1px solid #f3f4f6'}}>
                <td style={{padding: '12px 0'}}>
                  <div style={{fontWeight: '500'}}>{item.name || item.productName}</div>
                  {item.optionSummary && (
                    <div style={{fontSize: '12px', color: '#6b7280', marginTop: '4px'}}>
                      {item.optionSummary}
                    </div>
                  )}
                </td>
                <td style={{padding: '12px 0', textAlign: 'center', color: '#6b7280'}}>
                  {item.sku || 'N/A'}
                </td>
                <td style={{padding: '12px 0', textAlign: 'center', fontWeight: '500'}}>
                  {item.quantity}
                </td>
                <td style={{padding: '12px 0', textAlign: 'right'}}>
                  {formatCurrency(item.price)}
                </td>
                <td style={{padding: '12px 0', textAlign: 'right', fontWeight: '500'}}>
                  {formatCurrency(item.total || item.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Order Totals */}
      <div
        style={{
          backgroundColor: 'white',
          padding: '16px',
          borderRadius: '6px',
          marginBottom: '16px',
          border: '1px solid #e5e7eb',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '8px',
            fontSize: '14px',
          }}
        >
          <span>Subtotal:</span>
          <span>{formatCurrency(value.amountSubtotal)}</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '8px',
            fontSize: '14px',
          }}
        >
          <span>Shipping:</span>
          <span>{formatCurrency(value.amountShipping)}</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '8px',
            fontSize: '14px',
          }}
        >
          <span>Tax:</span>
          <span>{formatCurrency(value.amountTax)}</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: '12px',
            borderTop: '2px solid #e5e7eb',
            fontSize: '18px',
            fontWeight: 'bold',
          }}
        >
          <span>Total:</span>
          <span>{formatCurrency(value.totalAmount)}</span>
        </div>
      </div>

      {/* Tracking Info */}
      {(value.trackingNumber || value.manualTrackingNumber) && (
        <div
          style={{
            backgroundColor: '#dbeafe',
            padding: '16px',
            borderRadius: '6px',
            border: '1px solid #93c5fd',
          }}
        >
          <h3 style={{margin: '0 0 8px', fontSize: '16px', fontWeight: '600'}}>Tracking</h3>
          <div style={{fontSize: '14px'}}>
            <strong>Tracking Number:</strong> {value.trackingNumber || value.manualTrackingNumber}
          </div>
          {value.trackingUrl && (
            <a
              href={value.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{color: '#2563eb', textDecoration: 'underline', fontSize: '14px'}}
            >
              Track Package →
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// ORDER SCHEMA
// ============================================================================

export default defineType({
  name: 'order',
  title: 'Order',
  type: 'document',
  icon: PackageIcon,
  groups: [
    {name: 'overview', title: 'Overview', default: true},
    {name: 'customer', title: 'Customer'},
    {name: 'items', title: 'Items'},
    {name: 'shipping', title: 'Shipping'},
    {name: 'payment', title: 'Payment'},
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
      readOnly: true,
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
      readOnly: true,
    },
    {
      name: 'createdAt',
      type: 'datetime',
      title: 'Order Date',
      group: 'overview',
      readOnly: true,
    },

    // ========== CUSTOMER GROUP ==========
    {
      name: 'customerName',
      type: 'string',
      title: 'Customer Name',
      group: 'customer',
      readOnly: true,
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
        {
          type: 'object',
          name: 'orderCartItem',
          fields: [
            {name: 'name', type: 'string', title: 'Product Name'},
            {name: 'sku', type: 'string', title: 'SKU'},
            {name: 'productSlug', type: 'string', title: 'Product Slug'},
            {name: 'quantity', type: 'number', title: 'Quantity'},
            {name: 'price', type: 'number', title: 'Unit Price'},
            {name: 'total', type: 'number', title: 'Total'},
            {name: 'lineTotal', type: 'number', title: 'Line Total'},
            {name: 'optionSummary', type: 'string', title: 'Options'},
            {name: 'image', type: 'url', title: 'Image'},
            {name: 'productName', type: 'string', title: 'Product Name (Stripe)'},
          ],
          preview: {
            select: {
              title: 'name',
              subtitle: 'sku',
              quantity: 'quantity',
            },
            prepare({title, subtitle, quantity}) {
              return {
                title: title || 'Unnamed Product',
                subtitle: `${subtitle || 'No SKU'} • Qty: ${quantity || 0}`,
              }
            },
          },
        },
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
      name: 'amountShipping',
      type: 'number',
      title: 'Shipping',
      group: 'items',
      readOnly: true,
    },

    // ========== SHIPPING GROUP ==========
    {
      name: 'shippingAddress',
      type: 'object',
      title: 'Shipping Address',
      group: 'shipping',
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
    },
    {
      name: 'trackingNumber',
      type: 'string',
      title: 'Tracking Number (Auto)',
      group: 'shipping',
      readOnly: true,
    },
    {
      name: 'trackingUrl',
      type: 'url',
      title: 'Tracking URL',
      group: 'shipping',
      readOnly: true,
    },
    {
      name: 'shippingLabelUrl',
      type: 'url',
      title: 'Shipping Label',
      group: 'shipping',
      readOnly: true,
    },
    {
      name: 'packingSlipUrl',
      type: 'url',
      title: 'Packing Slip',
      group: 'shipping',
      readOnly: true,
    },
    {
      name: 'fulfilledAt',
      type: 'datetime',
      title: 'Fulfilled Date',
      group: 'shipping',
      readOnly: true,
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
      status: 'status',
      total: 'totalAmount',
    },
    prepare({orderNumber, customerName, status, total}) {
      const formattedTotal = total
        ? new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(total)
        : '$0.00'

      return {
        title: orderNumber || 'Untitled Order',
        subtitle: `${customerName || 'No customer'} • ${status || 'unknown'} • ${formattedTotal}`,
      }
    },
  },
})

// ============================================================================
// DOCUMENT ACTIONS - Export for use in sanity.config.ts
// ============================================================================

export const orderActions: DocumentActionsResolver = (prev, context) => {
  const {schemaType} = context

  // Only add these actions to order documents
  if (schemaType !== 'order') {
    return prev
  }

  return [
    // Keep default actions first
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
        onHandle: () => {
          if (doc?.packingSlipUrl) {
            window.open(doc.packingSlipUrl, '_blank')
          } else {
            const orderId = id.replace('drafts.', '')
            window.open(`/api/orders/${orderId}/packing-slip`, '_blank')
          }
          props.onComplete()
        },
      }
    },

    // Add Tracking
    (props) => {
      const {id, draft, published, patch} = props
      const doc = draft || published

      return {
        label: 'Add Tracking',
        icon: PackageIcon,
        tone: 'primary',
        disabled: !doc || doc.status === 'cancelled' || doc.status === 'shipped',
        onHandle: () => {
          const trackingNumber = prompt('Enter tracking number:')
          if (trackingNumber) {
            patch.execute([
              {
                patch: {
                  id: id.replace('drafts.', ''),
                  set: {
                    manualTrackingNumber: trackingNumber,
                    trackingNumber: trackingNumber,
                  },
                },
              },
            ])
          }
          props.onComplete()
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
        disabled: !doc || !doc.shippingAddress || doc.status === 'cancelled',
        onHandle: async () => {
          try {
            const response = await fetch('/api/shipping/create-label', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({
                orderId: id.replace('drafts.', ''),
                orderNumber: doc.orderNumber,
              }),
            })

            if (response.ok) {
              alert('Shipping label created successfully!')
              props.onComplete()
            } else {
              alert('Failed to create shipping label')
            }
          } catch (error) {
            console.error('Error creating label:', error)
            alert('Error creating shipping label')
          }
        },
      }
    },

    // Mark as Fulfilled
    (props) => {
      const {id, draft, published, patch} = props
      const doc = draft || published

      return {
        label: 'Mark Fulfilled',
        icon: PackageIcon,
        tone: 'positive',
        disabled: !doc || doc.status === 'fulfilled' || doc.status === 'shipped',
        onHandle: async () => {
          if (confirm('Mark this order as fulfilled?')) {
            try {
              patch.execute([
                {
                  patch: {
                    id: id.replace('drafts.', ''),
                    set: {
                      status: 'fulfilled',
                      fulfilledAt: new Date().toISOString(),
                    },
                  },
                },
              ])

              await fetch('/api/orders/fulfill', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                  orderId: id.replace('drafts.', ''),
                  orderNumber: doc.orderNumber,
                }),
              })

              props.onComplete()
            } catch (error) {
              console.error('Error marking as fulfilled:', error)
              alert('Error updating order')
            }
          }
        },
      }
    },
  ]
}
