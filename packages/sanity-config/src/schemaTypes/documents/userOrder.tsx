import type {Rule} from 'sanity'

// Order Schema
export default {
  name: 'order',
  title: 'Order',
  type: 'document',
  fields: [
    // Core Order Information
    {
      name: 'orderId',
      title: 'Order ID',
      type: 'string',
      description: 'Unique identifier for the order',
      validation: (rule: Rule) => rule.required(),
    },
    {
      name: 'orderDate',
      title: 'Order Date',
      type: 'datetime',
      description: 'Date and time when the order was placed',
      validation: (rule: Rule) => rule.required(),
    },
    {
      name: 'customer',
      title: 'Customer',
      type: 'object',
      fields: [
        {name: 'name', title: 'Name', type: 'string'},
        {name: 'email', title: 'Email', type: 'string'},
        {name: 'phone', title: 'Phone', type: 'string'},
        {
          name: 'shippingAddress',
          title: 'Shipping Address',
          type: 'object',
          fields: [
            {name: 'street', title: 'Street', type: 'string'},
            {name: 'city', title: 'City', type: 'string'},
            {name: 'state', title: 'State/Province', type: 'string'},
            {name: 'postalCode', title: 'Postal Code', type: 'string'},
            {name: 'country', title: 'Country', type: 'string'},
          ],
        },
      ],
    },

    // Order Items
    {
      name: 'items',
      title: 'Order Items',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'productId', title: 'Product ID', type: 'string'},
            {name: 'sku', title: 'SKU', type: 'string'},
            {name: 'name', title: 'Product Name', type: 'string'},
            {name: 'quantity', title: 'Quantity', type: 'number'},
            {name: 'price', title: 'Unit Price', type: 'number'},
            {name: 'image', title: 'Product Image', type: 'image'},
          ],
        },
      ],
    },

    // Payment Information (Stripe Integration)
    {
      name: 'payment',
      title: 'Payment Information',
      type: 'object',
      fields: [
        {name: 'stripePaymentId', title: 'Stripe Payment ID', type: 'string'},
        {
          name: 'status',
          title: 'Payment Status',
          type: 'string',
          options: {
            list: [
              {title: 'Paid', value: 'paid'},
              {title: 'Unpaid', value: 'unpaid'},
              {title: 'Refunded', value: 'refunded'},
              {title: 'Failed', value: 'failed'},
            ],
          },
        },
        {name: 'amount', title: 'Total Amount', type: 'number'},
        {name: 'currency', title: 'Currency', type: 'string'},
        {name: 'paymentMethod', title: 'Payment Method', type: 'string'},
        {name: 'paymentDate', title: 'Payment Date', type: 'datetime'},
      ],
    },

    // Fulfillment Status
    {
      name: 'fulfillment',
      title: 'Fulfillment Information',
      type: 'object',
      fields: [
        {
          name: 'status',
          title: 'Fulfillment Status',
          type: 'string',
          options: {
            list: [
              {title: 'Unfulfilled', value: 'unfulfilled'},
              {title: 'Processing', value: 'processing'},
              {title: 'Partially Fulfilled', value: 'partially_fulfilled'},
              {title: 'Fulfilled', value: 'fulfilled'},
              {title: 'Cancelled', value: 'cancelled'},
            ],
          },
        },
        {name: 'processedBy', title: 'Processed By', type: 'string'},
        {name: 'processedDate', title: 'Processing Date', type: 'datetime'},
        {name: 'packingSlipGenerated', title: 'Packing Slip Generated', type: 'boolean'},
        {name: 'packingSlipGeneratedDate', title: 'Packing Slip Date', type: 'datetime'},
      ],
    },

    // Shipping Information
    {
      name: 'shipping',
      title: 'Shipping Information',
      type: 'object',
      fields: [
        {name: 'method', title: 'Shipping Method', type: 'string'},
        {name: 'cost', title: 'Shipping Cost', type: 'number'},
        {name: 'trackingNumber', title: 'Tracking Number', type: 'string'},
        {name: 'carrier', title: 'Carrier', type: 'string'},
        {name: 'estimatedDelivery', title: 'Estimated Delivery', type: 'date'},
        {name: 'shippingLabelGenerated', title: 'Shipping Label Generated', type: 'boolean'},
        {name: 'shippingLabelDate', title: 'Label Generation Date', type: 'datetime'},
        {
          name: 'packageDimensions',
          title: 'Package Dimensions',
          type: 'object',
          fields: [
            {name: 'weight', title: 'Weight (lbs)', type: 'number'},
            {name: 'length', title: 'Length (in)', type: 'number'},
            {name: 'width', title: 'Width (in)', type: 'number'},
            {name: 'height', title: 'Height (in)', type: 'number'},
          ],
        },
      ],
    },

    // Additional Information
    {
      name: 'specialInstructions',
      title: 'Special Instructions',
      type: 'text',
    },
    {
      name: 'notes',
      title: 'Internal Notes',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'note', title: 'Note', type: 'text'},
            {name: 'addedBy', title: 'Added By', type: 'string'},
            {name: 'addedDate', title: 'Date Added', type: 'datetime'},
          ],
        },
      ],
    },

    // Audit Trail
    {
      name: 'activityLog',
      title: 'Activity Log',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'action', title: 'Action', type: 'string'},
            {name: 'performedBy', title: 'Performed By', type: 'string'},
            {name: 'timestamp', title: 'Timestamp', type: 'datetime'},
            {name: 'details', title: 'Details', type: 'text'},
          ],
        },
      ],
    },
  ],

  // Preview configuration for the content studio
  preview: {
    select: {
      title: 'orderId',
      subtitle: 'customer.name',
      status: 'fulfillment.status',
      payment: 'payment.status',
    },
    prepare(selection: {title?: string; subtitle?: string; status?: string; payment?: string}) {
      const {title, subtitle, status, payment} = selection
      return {
        title: `#${title}`,
        subtitle: subtitle,
        media: getStatusBadge(status, payment),
      }
    },
  },
}

// Helper function to determine the appropriate badge based on status
function getStatusBadge(
  fulfillmentStatus?: string,
  paymentStatus?: string,
): {emoji: string} {
  if (fulfillmentStatus === 'fulfilled') {
    return {emoji: '✅'}
  } else if (fulfillmentStatus === 'processing') {
    return {emoji: '🔄'}
  } else if (fulfillmentStatus === 'partially_fulfilled') {
    return {emoji: '⚠️'}
  } else if (fulfillmentStatus === 'cancelled') {
    return {emoji: '❌'}
  } else if (paymentStatus === 'unpaid' || paymentStatus === 'failed') {
    return {emoji: '💰'}
  } else {
    return {emoji: '📦'}
  }
}
