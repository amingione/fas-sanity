import React from 'react'
import type {ArrayOptions} from '@sanity/types'
import {defineField, defineType} from 'sanity'
import FulfillmentBadge from '../../components/inputs/FulfillmentBadge'
import OrderCartItemsInput from '../../components/inputs/OrderCartItemsInput'
import OrderShippingActions from '../../components/studio/OrderShippingActions'

const ORDER_MEDIA_URL =
  'https://cdn.sanity.io/images/r4og35qd/production/c3623df3c0e45a480c59d12765725f985f6d2fdb-1000x1000.png'

const COLLAPSIBLE_ARRAY_OPTIONS: ArrayOptions & {collapsible?: boolean; collapsed?: boolean} = {
  collapsible: true,
  collapsed: true,
}

const LEGACY_GROUP = 'legacy'

const ORDER_GROUPS = [
  {name: 'orderV2', title: 'Order v2', default: true},
  {name: LEGACY_GROUP, title: 'Legacy (v1) Order Data'},
]

export default defineType({
  name: 'order',
  title: 'Order',
  type: 'document',
  groups: ORDER_GROUPS,
  fields: [
    defineField({
      name: 'orderNumber',
      title: 'Order Number',
      type: 'string',
      description: 'Customer-facing order number shared across Stripe emails, invoices, and Studio.',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'status',
      title: 'Order Status',
      type: 'string',
      options: {
        list: ['paid', 'fulfilled', 'shipped', 'cancelled', 'refunded', 'closed', 'expired'],
        layout: 'dropdown',
      },
      readOnly: true,
      components: {
        input: FulfillmentBadge as any,
      },
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'paymentStatus',
      title: 'Payment Status',
      type: 'string',
      description: 'Raw Stripe payment status (e.g. succeeded, processing).',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      readOnly: true,
      initialValue: () => new Date().toISOString(),
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'stripeLastSyncedAt',
      title: 'Stripe Last Synced',
      type: 'datetime',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'invoiceRef',
      title: 'Linked Invoice',
      type: 'reference',
      to: [{type: 'invoice'}],
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description: 'Auto-generated from the Stripe session ID for previews.',
      options: {
        source: 'stripeSessionId',
        slugify: (value: string) =>
          (value || '')
            .toString()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 96),
      },
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'customerName',
      title: 'Customer Name',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'customerEmail',
      title: 'Customer Email',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'customerRef',
      title: 'Customer Reference',
      type: 'reference',
      to: [{type: 'customer'}],
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'customer',
      title: 'Customer (legacy)',
      type: 'reference',
      to: [{type: 'customer'}],
      hidden: true,
      options: {disableNew: true},
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'userId',
      title: 'User ID (Portal)',
      type: 'string',
      description: 'Legacy external id for the purchasing customer. FAS Auth uses the document _id.',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'cart',
      title: 'Cart Items',
      type: 'array',
      of: [{type: 'orderCartItem'}],
      readOnly: true,
      components: {
        input: OrderCartItemsInput as any,
      },
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'lineItems',
      title: 'Line Items (legacy)',
      type: 'array',
      of: [{type: 'orderCartItem'}],
      hidden: true,
      readOnly: true,
      components: {
        input: OrderCartItemsInput as any,
      },
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'totalAmount',
      title: 'Total Amount (USD)',
      type: 'number',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'amountSubtotal',
      title: 'Subtotal Amount',
      type: 'number',
      readOnly: true,
      description: 'Order subtotal before shipping/tax',
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'amountTax',
      title: 'Tax Amount',
      type: 'number',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'amountShipping',
      title: 'Shipping Amount',
      type: 'number',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'currency',
      title: 'Currency',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'paymentIntentId',
      title: 'Payment Intent ID',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'stripePaymentIntentStatus',
      title: 'Payment Intent Status',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'chargeId',
      title: 'Charge ID',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'cardBrand',
      title: 'Card Brand',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'cardLast4',
      title: 'Card Last4',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'receiptUrl',
      title: 'Receipt URL',
      type: 'url',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'amountRefunded',
      title: 'Total Refunded',
      type: 'number',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'lastRefundId',
      title: 'Last Refund ID',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'lastRefundStatus',
      title: 'Last Refund Status',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'lastRefundReason',
      title: 'Last Refund Reason',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'lastRefundedAt',
      title: 'Last Refunded At',
      type: 'datetime',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'lastDisputeId',
      title: 'Last Dispute ID',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'lastDisputeStatus',
      title: 'Last Dispute Status',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'lastDisputeReason',
      title: 'Last Dispute Reason',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'lastDisputeAmount',
      title: 'Last Dispute Amount',
      type: 'number',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'lastDisputeCurrency',
      title: 'Last Dispute Currency',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'lastDisputeCreatedAt',
      title: 'Last Dispute Created',
      type: 'datetime',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'lastDisputeDueBy',
      title: 'Last Dispute Evidence Due',
      type: 'datetime',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'paymentFailureCode',
      title: 'Payment Failure Code',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'paymentFailureMessage',
      title: 'Payment Failure Message',
      type: 'text',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'stripeSummary',
      title: 'Stripe Snapshot',
      type: 'stripeOrderSummary',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'stripeSessionId',
      title: 'Stripe Session ID',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'stripeSource',
      title: 'Stripe Source',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'stripeCheckoutStatus',
      title: 'Checkout Status',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'stripeSessionStatus',
      title: 'Checkout Status (legacy)',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
      hidden: ({document}) => !document?.stripeSessionStatus,
    }),
    defineField({
      name: 'stripeCheckoutMode',
      title: 'Checkout Mode',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'stripeCreatedAt',
      title: 'Stripe Session Created',
      type: 'datetime',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'stripeExpiresAt',
      title: 'Stripe Session Expired',
      type: 'datetime',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'checkoutDraft',
      title: 'Requires Follow-up',
      description: 'True when the checkout did not complete payment on the first attempt.',
      type: 'boolean',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'shippingAddress',
      title: 'Shipping Address',
      type: 'shippingAddress',
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'selectedService',
      title: 'Selected Shipping Rate',
      type: 'object',
      readOnly: true,
      options: {columns: 2},
      fields: [
        defineField({name: 'carrierId', title: 'Carrier ID', type: 'string'}),
        defineField({name: 'carrier', title: 'Carrier', type: 'string'}),
        defineField({name: 'service', title: 'Service Name', type: 'string'}),
        defineField({name: 'serviceCode', title: 'Service Code', type: 'string'}),
        defineField({name: 'amount', title: 'Rate Amount', type: 'number'}),
        defineField({name: 'currency', title: 'Currency', type: 'string'}),
        defineField({name: 'deliveryDays', title: 'Est. Delivery (days)', type: 'number'}),
        defineField({name: 'estimatedDeliveryDate', title: 'Est. Delivery Date', type: 'datetime'}),
      ],
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'selectedShippingAmount',
      title: 'Selected Shipping Amount',
      type: 'number',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'selectedShippingCurrency',
      title: 'Selected Shipping Currency',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'shippingDeliveryDays',
      title: 'Shipping Delivery Days',
      type: 'number',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'shippingEstimatedDeliveryDate',
      title: 'Shipping Estimated Delivery',
      type: 'datetime',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'shippingServiceCode',
      title: 'Shipping Service Code',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'shippingServiceName',
      title: 'Shipping Service Name',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'shippingMetadata',
      title: 'Shipping Metadata',
      type: 'object',
      readOnly: true,
      options: COLLAPSIBLE_ARRAY_OPTIONS,
      fields: [
        defineField({name: 'shipping_amount', title: 'Amount', type: 'string', readOnly: true}),
        defineField({name: 'shipping_carrier', title: 'Carrier', type: 'string', readOnly: true}),
        defineField({name: 'shipping_carrier_id', title: 'Carrier ID', type: 'string', readOnly: true}),
        defineField({name: 'shipping_currency', title: 'Currency', type: 'string', readOnly: true}),
        defineField({name: 'shipping_delivery_days', title: 'Delivery Days', type: 'string', readOnly: true}),
        defineField({name: 'shipping_estimated_delivery_date', title: 'Estimated Delivery', type: 'string', readOnly: true}),
        defineField({name: 'shipping_service', title: 'Service', type: 'string', readOnly: true}),
        defineField({name: 'shipping_service_code', title: 'Service Code', type: 'string', readOnly: true}),
        defineField({name: 'shipping_service_name', title: 'Service Name', type: 'string', readOnly: true}),
        defineField({name: 'amount', title: 'Amount (raw)', type: 'string', readOnly: true}),
        defineField({name: 'carrier', title: 'Carrier (raw)', type: 'string', readOnly: true}),
        defineField({name: 'carrier_id', title: 'Carrier ID (raw)', type: 'string', readOnly: true}),
        defineField({name: 'currency', title: 'Currency (raw)', type: 'string', readOnly: true}),
        defineField({name: 'service', title: 'Service (raw)', type: 'string', readOnly: true}),
        defineField({name: 'service_code', title: 'Service Code (raw)', type: 'string', readOnly: true}),
        defineField({name: 'shipping_rate_id', title: 'Shipping Rate ID', type: 'string', readOnly: true}),
        defineField({name: 'source', title: 'Source', type: 'string', readOnly: true}),
      ],
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'weight',
      title: 'Package Weight',
      type: 'shipmentWeight',
      description: 'Auto-calculated from cart items.',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'dimensions',
      title: 'Package Dimensions',
      type: 'packageDimensions',
      description: 'Auto-filled using product defaults.',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'shippingCarrier',
      title: 'Shipping Carrier',
      type: 'string',
      readOnly: true,
      options: {
        list: ['UPS', 'FedEx', 'USPS', 'Other'],
        layout: 'dropdown',
      },
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'shippingLabelUrl',
      title: 'Shipping Label URL',
      type: 'url',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'trackingNumber',
      title: 'Tracking Number',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'trackingUrl',
      title: 'Tracking URL',
      type: 'url',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'packingSlipUrl',
      title: 'Packing Slip PDF URL',
      type: 'url',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'shipStationOrderId',
      title: 'ShipStation Order ID',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'shipStationLabelId',
      title: 'ShipStation Label ID',
      type: 'string',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'fulfilledAt',
      title: 'Fulfilled Date',
      type: 'datetime',
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'shippingActions',
      title: 'Shipping',
      type: 'string',
      readOnly: true,
      components: {input: OrderShippingActions as any},
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'shippingLog',
      title: 'Shipping History',
      type: 'array',
      of: [{type: 'shippingLogEntry'}],
      readOnly: true,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'orderEvents',
      title: 'Stripe Event Log',
      type: 'array',
      readOnly: true,
      of: [{type: 'orderEvent'}],
      options: {layout: 'grid'},
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'webhookNotified',
      title: 'Webhook Notification Sent',
      type: 'boolean',
      readOnly: true,
      initialValue: false,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'confirmationEmailSent',
      title: 'Confirmation Email Sent',
      type: 'boolean',
      readOnly: true,
      initialValue: false,
      group: LEGACY_GROUP,
    }),
    defineField({
      name: 'orderV2',
      title: 'Order v2',
      type: 'object',
      group: 'orderV2',
      options: COLLAPSIBLE_ARRAY_OPTIONS,
      fields: [
        defineField({name: 'orderId', title: 'Order ID', type: 'string'}),
        defineField({
          name: 'createdAt',
          title: 'Created At',
          type: 'datetime',
          initialValue: () => new Date().toISOString(),
        }),
        defineField({
          name: 'status',
          title: 'Status',
          type: 'string',
          options: {
            list: [
              {title: 'Paid', value: 'paid'},
              {title: 'Pending', value: 'pending'},
              {title: 'Failed', value: 'failed'},
              {title: 'Canceled', value: 'canceled'},
              {title: 'Shipped', value: 'shipped'},
              {title: 'Refunded', value: 'refunded'},
            ],
            layout: 'dropdown',
          },
        }),
        defineField({
          name: 'customer',
          title: 'Customer',
          type: 'object',
          options: {columns: 2},
          fields: [
            defineField({name: 'customerId', title: 'Customer ID', type: 'string'}),
            defineField({name: 'name', title: 'Name', type: 'string'}),
            defineField({name: 'email', title: 'Email', type: 'string'}),
            defineField({name: 'phone', title: 'Phone', type: 'string'}),
            defineField({
              name: 'shippingAddress',
              title: 'Shipping Address',
              type: 'object',
              options: {columns: 2},
              fields: [
                defineField({name: 'street', title: 'Street', type: 'string'}),
                defineField({name: 'city', title: 'City', type: 'string'}),
                defineField({name: 'state', title: 'State', type: 'string'}),
                defineField({name: 'zip', title: 'ZIP / Postal Code', type: 'string'}),
                defineField({name: 'country', title: 'Country', type: 'string'}),
              ],
            }),
          ],
        }),
        defineField({
          name: 'items',
          title: 'Items',
          type: 'array',
          of: [
            defineField({
              type: 'object',
              name: 'orderV2Item',
              title: 'Item',
              fields: [
                defineField({name: 'productId', title: 'Product ID', type: 'string'}),
                defineField({name: 'productName', title: 'Product Name', type: 'string'}),
                defineField({name: 'quantity', title: 'Quantity', type: 'number'}),
                defineField({name: 'price', title: 'Unit Price', type: 'number'}),
                defineField({
                  name: 'options',
                  title: 'Options',
                  type: 'array',
                  of: [
                    defineField({
                      type: 'object',
                      name: 'orderV2ItemOption',
                      title: 'Option',
                      fields: [
                        defineField({name: 'optionId', title: 'Option ID', type: 'string'}),
                        defineField({name: 'optionName', title: 'Option Name', type: 'string'}),
                        defineField({name: 'optionValue', title: 'Option Value', type: 'string'}),
                      ],
                    }),
                  ],
                  options: {layout: 'tags'},
                }),
                defineField({
                  name: 'upgrades',
                  title: 'Upgrades',
                  type: 'array',
                  of: [
                    defineField({
                      type: 'object',
                      name: 'orderV2ItemUpgrade',
                      title: 'Upgrade',
                      fields: [
                        defineField({name: 'upgradeId', title: 'Upgrade ID', type: 'string'}),
                        defineField({name: 'upgradeName', title: 'Upgrade Name', type: 'string'}),
                        defineField({name: 'upgradeValue', title: 'Upgrade Value', type: 'string'}),
                      ],
                    }),
                  ],
                  options: {layout: 'tags'},
                }),
              ],
            }),
          ],
        }),
        defineField({
          name: 'orderSummary',
          title: 'Order Summary',
          type: 'object',
          options: {columns: 2},
          fields: [
            defineField({name: 'subtotal', title: 'Subtotal', type: 'number'}),
            defineField({name: 'discount', title: 'Discount', type: 'number'}),
            defineField({name: 'shippingFee', title: 'Shipping Fee', type: 'number'}),
            defineField({name: 'tax', title: 'Tax', type: 'number'}),
            defineField({name: 'total', title: 'Total', type: 'number'}),
          ],
        }),
        defineField({
          name: 'payment',
          title: 'Payment',
          type: 'object',
          options: {columns: 2},
          fields: [
            defineField({name: 'status', title: 'Payment Status', type: 'string'}),
            defineField({
              name: 'stripePaymentIntentId',
              title: 'Stripe Payment Intent ID',
              type: 'string',
            }),
            defineField({name: 'stripeChargeId', title: 'Stripe Charge ID', type: 'string'}),
            defineField({name: 'receiptUrl', title: 'Receipt URL', type: 'url'}),
            defineField({name: 'method', title: 'Payment Method', type: 'string'}),
          ],
        }),
        defineField({
          name: 'shipping',
          title: 'Shipping',
          type: 'object',
          options: {columns: 2},
          fields: [
            defineField({name: 'carrier', title: 'Carrier', type: 'string'}),
            defineField({name: 'serviceName', title: 'Service Name', type: 'string'}),
            defineField({name: 'trackingNumber', title: 'Tracking Number', type: 'string'}),
            defineField({name: 'status', title: 'Shipping Status', type: 'string'}),
            defineField({
              name: 'estimatedDelivery',
              title: 'Estimated Delivery',
              type: 'datetime',
            }),
          ],
        }),
        defineField({name: 'notes', title: 'Notes', type: 'text'}),
        defineField({
          name: 'admin',
          title: 'Admin',
          type: 'object',
          options: {columns: 2},
          fields: [
            defineField({name: 'webhookStatus', title: 'Webhook Status', type: 'string'}),
            defineField({name: 'lastSync', title: 'Last Sync', type: 'datetime'}),
            defineField({
              name: 'stripeEventLog',
              title: 'Stripe Event Log',
              type: 'array',
              of: [
                defineField({
                  type: 'object',
                  name: 'orderV2StripeEvent',
                  title: 'Stripe Event',
                  fields: [
                    defineField({name: 'eventType', title: 'Event Type', type: 'string'}),
                    defineField({name: 'timestamp', title: 'Timestamp', type: 'datetime'}),
                    defineField({name: 'details', title: 'Details', type: 'text'}),
                  ],
                }),
              ],
              options: COLLAPSIBLE_ARRAY_OPTIONS,
            }),
            defineField({
              name: 'failureReason',
              title: 'Failure Reason',
              type: 'string',
              description: 'Populated when status is failed or canceled.',
            }),
            defineField({
              name: 'refunds',
              title: 'Refunds',
              type: 'array',
              of: [
                defineField({
                  type: 'object',
                  name: 'orderV2Refund',
                  title: 'Refund',
                  fields: [
                    defineField({name: 'refundId', title: 'Refund ID', type: 'string'}),
                    defineField({name: 'amount', title: 'Amount', type: 'number'}),
                    defineField({name: 'date', title: 'Date', type: 'datetime'}),
                    defineField({name: 'reason', title: 'Reason', type: 'string'}),
                  ],
                }),
              ],
              options: COLLAPSIBLE_ARRAY_OPTIONS,
            }),
            defineField({
              name: 'disputes',
              title: 'Disputes',
              type: 'array',
              of: [
                defineField({
                  type: 'object',
                  name: 'orderV2Dispute',
                  title: 'Dispute',
                  fields: [
                    defineField({name: 'disputeId', title: 'Dispute ID', type: 'string'}),
                    defineField({name: 'status', title: 'Status', type: 'string'}),
                    defineField({name: 'date', title: 'Date', type: 'datetime'}),
                    defineField({name: 'reason', title: 'Reason', type: 'string'}),
                  ],
                }),
              ],
              options: COLLAPSIBLE_ARRAY_OPTIONS,
            }),
          ],
        }),
      ],
    }),
  ],

  preview: {
    select: {
      stripeSessionId: 'stripeSessionId',
      email: 'customerEmail',
      total: 'totalAmount',
      status: 'status',
      orderNumber: 'orderNumber',
      customerName: 'customerName',
      shippingName: 'shippingAddress.name',
      createdAt: 'createdAt',
    },
    prepare({
      stripeSessionId,
      email,
      total,
      status,
      orderNumber,
      customerName,
      shippingName,
      createdAt,
    }) {
      const ref = orderNumber || (stripeSessionId ? `#${stripeSessionId.slice(-6)}` : 'Order')
      const name = customerName || shippingName || email || 'Customer'
      const amount = typeof total === 'number' ? `• ${new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(total)}` : ''
      const statusLabel = (status || 'paid').toLowerCase()
      const dateLabel = createdAt ? new Intl.DateTimeFormat(undefined, {year: 'numeric', month: 'short', day: 'numeric'}).format(new Date(createdAt)) : ''

      const tone: Record<string, {bg: string; fg: string; border: string}> = {
        fulfilled: {bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0'},
        shipped: {bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE'},
        paid: {bg: '#EEF2FF', fg: '#4C1D95', border: '#C4B5FD'},
        cancelled: {bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA'},
        refunded: {bg: '#FFFBEB', fg: '#B45309', border: '#FDE68A'},
        closed: {bg: '#F3F4F6', fg: '#374151', border: '#E5E7EB'},
        expired: {bg: '#F3F4F6', fg: '#374151', border: '#E5E7EB'},
      }

      const badgeTone = tone[statusLabel] || tone.closed

      const StatusBadge = () => (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1px 6px',
            borderRadius: '999px',
            border: `1px solid ${badgeTone.border}`,
            backgroundColor: badgeTone.bg,
            color: badgeTone.fg,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          {statusLabel}
        </span>
      )

      const MediaLogo = () => (
        <img
          src={ORDER_MEDIA_URL}
          alt="Order"
          style={{
            width: 32,
            height: 32,
            borderRadius: 4,
            objectFit: 'cover',
          }}
        />
      )

      return {
        title: `${ref} — ${name}`,
        subtitle: [dateLabel, amount].filter(Boolean).join(' '),
        media: MediaLogo,
        status: StatusBadge,
      }
    },
  },

  orderings: [
    {
      title: 'Created Date (Newest)',
      name: 'createdAtDesc',
      by: [
        { field: 'createdAt', direction: 'desc' },
        { field: '_createdAt', direction: 'desc' },
      ],
    },
    {
      title: 'Created Date (Oldest)',
      name: 'createdAtAsc',
      by: [
        { field: 'createdAt', direction: 'asc' },
        { field: '_createdAt', direction: 'asc' },
      ],
    },
    {
      title: 'Fulfilled Date (Newest)',
      name: 'fulfilledAtDesc',
      by: [
        { field: 'fulfilledAt', direction: 'desc' },
        { field: 'createdAt', direction: 'desc' },
      ],
    },
    {
      title: 'Order Total (High → Low)',
      name: 'totalAmountDesc',
      by: [
        { field: 'totalAmount', direction: 'desc' },
      ],
    },
    {
      title: 'Order Number (A → Z)',
      name: 'orderNumberAsc',
      by: [
        { field: 'orderNumber', direction: 'asc' },
      ],
    },
    {
      title: 'Order Status (A → Z)',
      name: 'orderStatusAsc',
      by: [
        { field: 'status', direction: 'asc' },
        { field: 'paymentStatus', direction: 'asc' },
        { field: 'createdAt', direction: 'desc' },
      ],
    },
    {
      title: 'Order Status (Z → A)',
      name: 'orderStatusDesc',
      by: [
        { field: 'status', direction: 'desc' },
        { field: 'paymentStatus', direction: 'desc' },
        { field: 'createdAt', direction: 'desc' },
      ],
    },
  ],
})
