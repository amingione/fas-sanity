import {defineField, defineType} from 'sanity'

const readOnlyNumberField = (name: string, title?: string) =>
  defineField({
    name,
    title: title || name,
    type: 'number',
    readOnly: true,
  })

export default defineType({
  name: 'profitLoss',
  title: 'Profit & Loss Statement',
  type: 'document',
  fields: [
    defineField({
      name: 'period',
      title: 'Period',
      type: 'string',
      description: 'YYYY-MM',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'startDate',
      title: 'Start Date',
      type: 'date',
    }),
    defineField({
      name: 'endDate',
      title: 'End Date',
      type: 'date',
    }),
    readOnlyNumberField('grossRevenue', 'Gross Revenue'),
    readOnlyNumberField('returns', 'Returns & Refunds'),
    readOnlyNumberField('netRevenue', 'Net Revenue'),
    readOnlyNumberField('revenueOnline', 'Revenue · Online'),
    readOnlyNumberField('revenueInStore', 'Revenue · In-Store'),
    readOnlyNumberField('revenueWholesale', 'Revenue · Wholesale'),
    readOnlyNumberField('cogs', 'Cost of Goods Sold'),
    readOnlyNumberField('grossProfit', 'Gross Profit'),
    readOnlyNumberField('grossMargin', 'Gross Margin %'),
    readOnlyNumberField('laborCosts', 'Labor Costs'),
    readOnlyNumberField('rentUtilities', 'Rent & Utilities'),
    readOnlyNumberField('marketing', 'Marketing'),
    readOnlyNumberField('equipment', 'Equipment'),
    readOnlyNumberField('insurance', 'Insurance'),
    readOnlyNumberField('shipping', 'Shipping/Freight'),
    readOnlyNumberField('software', 'Software/Tools'),
    readOnlyNumberField('other', 'Other Expenses'),
    readOnlyNumberField('totalExpenses', 'Total Operating Expenses'),
    readOnlyNumberField('operatingProfit', 'Operating Profit'),
    readOnlyNumberField('netProfit', 'Net Profit'),
    readOnlyNumberField('netMargin', 'Net Margin %'),
    readOnlyNumberField('totalOrders', 'Total Orders'),
    readOnlyNumberField('avgOrderValue', 'Average Order Value'),
    readOnlyNumberField('avgProfitPerOrder', 'Average Profit per Order'),
  ],
  preview: {
    select: {
      title: 'period',
      netRevenue: 'netRevenue',
      netProfit: 'netProfit',
    },
    prepare({title, netRevenue, netProfit}) {
      const periodLabel = title || 'Period'
      return {
        title: `${periodLabel} · Net Revenue $${Number(netRevenue ?? 0).toFixed(0)}`,
        subtitle: `Net Profit $${Number(netProfit ?? 0).toFixed(0)}`,
      }
    },
  },
})
