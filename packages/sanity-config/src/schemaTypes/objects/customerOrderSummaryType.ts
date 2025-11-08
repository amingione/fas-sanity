import {defineType, defineField} from 'sanity'

export const customerOrderSummaryType = defineType({
  name: 'customerOrderSummary',
  title: 'Order Summary',
  type: 'object',
  fields: [
    defineField({name: 'orderNumber', title: 'Order Number', type: 'string'}),
    defineField({name: 'status', title: 'Status', type: 'string'}),
    defineField({name: 'orderDate', title: 'Order Date', type: 'datetime'}),
    defineField({name: 'total', title: 'Total Amount', type: 'number'}),
  ],
})
