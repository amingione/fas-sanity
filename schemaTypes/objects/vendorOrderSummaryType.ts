import { defineType, defineField } from 'sanity'

export const vendorOrderSummaryType = defineType({
  name: 'vendorOrderSummary',
  title: 'Vendor Order',
  type: 'object',
  fields: [
    defineField({ name: 'orderId', title: 'Order ID', type: 'string' }),
    defineField({ name: 'status', title: 'Status', type: 'string' }),
    defineField({ name: 'amount', title: 'Order Total', type: 'number' }),
    defineField({ name: 'orderDate', title: 'Order Date', type: 'datetime' }),
  ],
})

