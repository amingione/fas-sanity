import {defineField, defineType} from 'sanity'

const EXPENSE_STATUS_OPTIONS = [
  {title: 'Pending', value: 'pending'},
  {title: 'Approved', value: 'approved'},
  {title: 'Paid', value: 'paid'},
  {title: 'Cancelled', value: 'cancelled'},
]

const RECURRING_FREQUENCY_OPTIONS = [
  {title: 'Weekly', value: 'Weekly'},
  {title: 'Monthly', value: 'Monthly'},
  {title: 'Quarterly', value: 'Quarterly'},
  {title: 'Annually', value: 'Annually'},
]

const EXPENSE_CATEGORY_OPTIONS = [
  {title: 'Supplies', value: 'supplies'},
  {title: 'Equipment', value: 'equipment'},
  {title: 'Software / Subscriptions', value: 'software'},
  {title: 'Marketing', value: 'marketing'},
  {title: 'Utilities', value: 'utilities'},
  {title: 'Rent / Lease', value: 'rent'},
  {title: 'Labor', value: 'labor'},
  {title: 'Shipping', value: 'shipping'},
  {title: 'Parts', value: 'parts'},
  {title: 'Other', value: 'other'},
]

export default defineType({
  name: 'expense',
  title: 'Expenses',
  type: 'document',
  fields: [
    defineField({
      name: 'expenseNumber',
      title: 'Expense Number',
      type: 'string',
      description: 'Auto-generated (EXP-XXXXXX). Do not edit manually.',
      readOnly: true,
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {list: EXPENSE_STATUS_OPTIONS},
      initialValue: 'pending',
    }),
    defineField({name: 'amount', title: 'Amount', type: 'number'}),
    defineField({name: 'description', title: 'Description', type: 'string'}),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {list: EXPENSE_CATEGORY_OPTIONS},
    }),
    defineField({name: 'vendorName', title: 'Vendor Name', type: 'string'}),
    defineField({
      name: 'vendor',
      title: 'Vendor (linked)',
      type: 'reference',
      to: [{type: 'vendor'}],
    }),
    defineField({
      name: 'bill',
      title: 'Associated Bill',
      type: 'reference',
      to: [{type: 'bill'}],
    }),
    defineField({name: 'dueDate', title: 'Due Date', type: 'date'}),
    defineField({name: 'paidDate', title: 'Paid Date', type: 'date'}),
    defineField({
      name: 'recurring',
      title: 'Recurring',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'recurringFrequency',
      title: 'Recurring Frequency',
      type: 'string',
      options: {list: RECURRING_FREQUENCY_OPTIONS},
      hidden: ({document}) => !document?.recurring,
    }),
    defineField({name: 'notes', title: 'Notes', type: 'text', rows: 3}),
  ],
  preview: {
    select: {
      expenseNumber: 'expenseNumber',
      vendorName: 'vendorName',
      status: 'status',
      amount: 'amount',
    },
    prepare(selection) {
      const title = selection.expenseNumber || 'Expense'
      const vendor = selection.vendorName ? ` · ${selection.vendorName}` : ''
      const amount = typeof selection.amount === 'number' ? ` · $${selection.amount.toFixed(2)}` : ''
      return {
        title,
        subtitle: `${selection.status || 'pending'}${vendor}${amount}`,
      }
    },
  },
})
