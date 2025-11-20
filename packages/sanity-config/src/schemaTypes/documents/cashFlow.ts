import {defineField, defineType} from 'sanity'

const readOnlyNumberField = (name: string, title?: string) =>
  defineField({
    name,
    title: title || name,
    type: 'number',
    readOnly: true,
  })

export default defineType({
  name: 'cashFlow',
  title: 'Cash Flow',
  type: 'document',
  fields: [
    defineField({
      name: 'period',
      title: 'Period',
      type: 'string',
      description: 'YYYY-MM',
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
    readOnlyNumberField('cashFromSales', 'Cash from Sales'),
    readOnlyNumberField('cashFromWholesale', 'Cash from Wholesale'),
    defineField({
      name: 'otherIncome',
      title: 'Other Income',
      type: 'number',
    }),
    readOnlyNumberField('totalCashIn', 'Total Cash In'),
    readOnlyNumberField('cashForCOGS', 'Cash for COGS'),
    readOnlyNumberField('cashForExpenses', 'Cash for Expenses'),
    readOnlyNumberField('totalCashOut', 'Total Cash Out'),
    readOnlyNumberField('netCashFlow', 'Net Cash Flow'),
    defineField({
      name: 'beginningBalance',
      title: 'Beginning Balance',
      type: 'number',
    }),
    readOnlyNumberField('endingBalance', 'Ending Balance'),
    readOnlyNumberField('accountsReceivable', 'Accounts Receivable'),
    readOnlyNumberField('accountsPayable', 'Accounts Payable'),
  ],
  preview: {
    select: {
      title: 'period',
      netCashFlow: 'netCashFlow',
    },
    prepare({title, netCashFlow}) {
      const periodLabel = title || 'Period'
      const netLabel = typeof netCashFlow === 'number' ? netCashFlow.toFixed(0) : '0'
      return {
        title: `${periodLabel} · Net Cash ${netLabel}`,
        subtitle: 'Cash Flow Summary',
      }
    },
  },
})
