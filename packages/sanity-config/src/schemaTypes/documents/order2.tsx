// src/schemaTypes/documents/order.tsx
import {defineType, defineField} from 'sanity'
import {PackageIcon} from '@sanity/icons'
import OrderNumberInput from '../../components/inputs/OrderNumberInput'
import ComputedOrderCustomerNameInput from '../../components/inputs/ComputedOrderCustomerNameInput'
import FulfillmentOverview from '../../components/FulfillmentOverview'
import {OrderFulfillmentStatus} from '../../components/OrderFulfillmentStatus'
import {formatOrderNumber} from '../../utils/orderNumber'

export default defineType({
  name: 'order2',
  title: 'Order',
  type: 'document',
  icon: PackageIcon,
  groups: [
    {name: 'basics', title: 'Basics', default: true},
    {name: 'customer', title: 'Customer'},
    {name: 'items', title: 'Items'},
    {name: 'payment', title: 'Payment'},
    {name: 'fulfillment', title: 'Fulfillment'},
    {
      name: 'wholesale',
      title: 'Wholesale',
      hidden: ({document}) => document?.orderType !== 'wholesale',
    },
  ],

  fields: [
    //
    // BASICS
    //
    defineField({
      name: 'orderNumber',
      type: 'string',
      title: 'Order Number',
      group: 'basics',
      components: {input: OrderNumberInput},
    }),

    defineField({
      name: 'orderType',
      type: 'string',
      title: 'Order Type',
      group: 'basics',
      description: 'online | in-store | wholesale',
      readOnly: true,
    }),

    defineField({
      name: 'status',
      type: 'string',
      title: 'Order Status',
      group: 'basics',
      options: {
        list: [
          {title: 'Paid', value: 'paid'},
          {title: 'Fulfilled', value: 'fulfilled'},
          {title: 'Shipped', value: 'shipped'},
          {title: 'Cancelled', value: 'cancelled'},
          {title: 'Refunded', value: 'refunded'},
        ],
      },
    }),

    defineField({
      name: 'createdAt',
      type: 'datetime',
      title: 'Order Date',
      group: 'basics',
    }),

    //
    // CUSTOMER
    //
    defineField({
      name: 'customerName',
      title: 'Customer Name',
      type: 'string',
      group: 'customer',
      components: {input: ComputedOrderCustomerNameInput},
    }),

    defineField({
      name: 'customerEmail',
      type: 'string',
      title: 'Customer Email',
      group: 'customer',
    }),

    defineField({
      name: 'customerRef',
      type: 'reference',
      to: [{type: 'customer'}, {type: 'vendor'}],
      hidden: true,
      group: 'customer',
    }),

    defineField({
      name: 'billingAddress',
      type: 'shippingAddress',
      title: 'Billing Address',
      group: 'customer',
      options: {collapsible: true},
    }),

    //
    // ITEMS
    //
    defineField({
      name: 'cart',
      type: 'array',
      title: 'Order Items',
      of: [{type: 'orderCartItem'}],
      group: 'items',
    }),

    //
    // TOTALS
    //
    defineField({name: 'amountSubtotal', type: 'number', title: 'Subtotal', group: 'basics'}),
    defineField({name: 'amountTax', type: 'number', title: 'Tax', group: 'basics'}),
    defineField({name: 'amountShipping', type: 'number', title: 'Shipping', group: 'basics'}),
    defineField({name: 'totalAmount', type: 'number', title: 'Total', group: 'basics'}),

    //
    // PAYMENT
    //
    defineField({
      name: 'paymentStatus',
      type: 'string',
      title: 'Payment Status',
      group: 'payment',
    }),
    defineField({name: 'stripeSessionId', type: 'string', hidden: true, group: 'payment'}),
    defineField({name: 'paymentIntentId', type: 'string', hidden: true, group: 'payment'}),
    defineField({name: 'cardBrand', type: 'string', title: 'Card Brand', group: 'payment'}),
    defineField({name: 'cardLast4', type: 'string', title: 'Card Last 4', group: 'payment'}),
    defineField({
      name: 'receiptUrl',
      type: 'url',
      title: 'Receipt URL',
      group: 'payment',
    }),

    //
    // FULFILLMENT (SLIMMED)
    //
    defineField({
      name: 'fulfillmentOverview',
      type: 'object',
      title: 'Fulfillment Overview',
      group: 'fulfillment',
      components: {input: FulfillmentOverview},
      fields: [{name: 'placeholder', type: 'string', hidden: true}],
    }),

    defineField({
      name: 'fulfillmentStatusDisplay',
      type: 'object',
      title: 'Fulfillment Status',
      group: 'fulfillment',
      components: {input: OrderFulfillmentStatus},
      fields: [{name: 'placeholder', type: 'string', hidden: true}],
    }),

    defineField({
      name: 'shippingAddress',
      type: 'shippingAddress',
      title: 'Shipping Address',
      group: 'fulfillment',
      options: {collapsible: true},
    }),

    defineField({
      name: 'trackingNumber',
      type: 'string',
      title: 'Tracking Number',
      group: 'fulfillment',
    }),
    defineField({
      name: 'trackingUrl',
      type: 'url',
      title: 'Tracking URL',
      group: 'fulfillment',
    }),

    defineField({
      name: 'carrier',
      type: 'string',
      title: 'Carrier',
      group: 'fulfillment',
      options: {list: ['USPS', 'UPS', 'FedEx', 'Other']},
    }),

    defineField({
      name: 'service',
      type: 'string',
      title: 'Shipping Service',
      group: 'fulfillment',
    }),

    defineField({
      name: 'shippingLabelUrl',
      type: 'url',
      title: 'Shipping Label URL',
      group: 'fulfillment',
    }),
    defineField({
      name: 'shippingLabelFile',
      type: 'file',
      title: 'Shipping Label File',
      group: 'fulfillment',
      options: {storeOriginalFilename: true},
    }),

    defineField({
      name: 'easyPostShipmentId',
      type: 'string',
      title: 'EasyPost Shipment ID',
      group: 'fulfillment',
    }),
    defineField({
      name: 'easyPostTrackerId',
      type: 'string',
      title: 'EasyPost Tracker ID',
      group: 'fulfillment',
    }),

    //
    // WHOLESALE (MINIMAL)
    //
    defineField({
      name: 'wholesaleWorkflowStatus',
      type: 'string',
      title: 'Wholesale Workflow Status',
      group: 'wholesale',
      options: {
        list: [
          {title: 'Pending Review', value: 'pending'},
          {title: 'Approved', value: 'approved'},
          {title: 'Paid', value: 'paid'},
          {title: 'Fulfilled', value: 'fulfilled'},
          {title: 'Cancelled', value: 'cancelled'},
        ],
      },
      hidden: ({document}) => document?.orderType !== 'wholesale',
    }),

    defineField({
      name: 'wholesaleDetails',
      type: 'object',
      title: 'Wholesale Details',
      group: 'wholesale',
      hidden: ({document}) => document?.orderType !== 'wholesale',
      options: {collapsible: true},
      fields: [
        {name: 'vendor', type: 'reference', to: [{type: 'vendor'}]},
        {name: 'pricingTier', type: 'string'},
        {name: 'poNumber', type: 'string'},
        {name: 'paymentLinkId', type: 'string'},
        {name: 'notes', type: 'text'},
      ],
    }),
  ],

  preview: {
    select: {
      orderNumber: 'orderNumber',
      customerName: 'customerName',
      status: 'status',
      total: 'totalAmount',
    },
    prepare({orderNumber, customerName, status, total}) {
      return {
        title: formatOrderNumber(orderNumber) || 'Order',
        subtitle: `${customerName || 'No customer'} • ${status || 'unknown'} • ${
          total ? `$${total}` : '$0.00'
        }`,
      }
    },
  },
})
