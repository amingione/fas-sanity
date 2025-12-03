import {defineType, defineField} from 'sanity'
import ReferenceCodeInput from '../../components/inputs/ReferenceCodeInput'
import {generateReferenceCode} from '../../../../../shared/referenceCodes'

const API_VERSION = '2024-10-01'

const EXPENSE_CATEGORIES = [
  {title: 'Materials/Parts', value: 'materials'},
  {title: 'Labor', value: 'labor'},
  {title: 'Rent/Utilities', value: 'rent_utilities'},
  {title: 'Marketing/Advertising', value: 'marketing'},
  {title: 'Equipment', value: 'equipment'},
  {title: 'Insurance', value: 'insurance'},
  {title: 'Shipping/Freight', value: 'shipping'},
  {title: 'Software/Tools', value: 'software'},
  {title: 'Phone/Internet', value: 'communications'},
  {title: 'Vehicle/Fuel', value: 'vehicle'},
  {title: 'Office Supplies', value: 'office'},
  {title: 'Training/Education', value: 'training'},
  {title: 'Legal/Professional', value: 'legal'},
  {title: 'Bank Fees', value: 'bank_fees'},
  {title: 'Other', value: 'other'},
]

const PAYMENT_METHODS = ['Cash', 'Check', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Other']

const STATUS_OPTIONS = [
  {title: '⏳ Pending', value: 'pending'},
  {title: '✅ Paid', value: 'paid'},
  {title: '📅 Scheduled', value: 'scheduled'},
  {title: '❌ Cancelled', value: 'cancelled'},
]

const RECURRING_FREQUENCY = ['Weekly', 'Monthly', 'Quarterly', 'Annually']

export default defineType({
  name: 'expense',
  title: 'Expense',
  type: 'document',
  fields: [
    defineField({
      name: 'expenseNumber',
      title: 'Expense Number',
      type: 'string',
      readOnly: true,
      components: {input: ReferenceCodeInput},
      description: 'Auto-generated reference like EXP-000123.',
      initialValue: async ({getClient}) => {
        const client = getClient?.({apiVersion: API_VERSION})
        return generateReferenceCode(client, {
          prefix: 'EXP-',
          typeName: 'expense',
          fieldName: 'expenseNumber',
        })
      },
    }),
    defineField({
      name: 'date',
      title: 'Expense Date',
      type: 'date',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'vendor',
      title: 'Vendor',
      type: 'reference',
      to: [{type: 'vendor'}],
    }),
    defineField({
      name: 'vendorName',
      title: 'Vendor Name (manual)',
      type: 'string',
      description: 'Use when the vendor is not in the vendor list.',
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: EXPENSE_CATEGORIES,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'amount',
      title: 'Amount',
      type: 'number',
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: 'taxDeductible',
      title: 'Tax Deductible',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'paymentMethod',
      title: 'Payment Method',
      type: 'string',
      options: {list: PAYMENT_METHODS},
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {list: STATUS_OPTIONS},
      initialValue: 'pending',
    }),
    defineField({
      name: 'paidDate',
      title: 'Paid Date',
      type: 'date',
    }),
    defineField({
      name: 'dueDate',
      title: 'Due Date',
      type: 'date',
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'receipt',
      title: 'Receipt',
      type: 'file',
      description: 'Upload receipt or invoice document.',
    }),
    defineField({
      name: 'receiptNumber',
      title: 'Receipt Number',
      type: 'string',
    }),
    defineField({
      name: 'recurring',
      title: 'Recurring Expense',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'recurringFrequency',
      title: 'Recurring Frequency',
      type: 'string',
      options: {list: RECURRING_FREQUENCY},
      hidden: ({document}) => !document?.recurring,
    }),
    defineField({
      name: 'linkedBill',
      title: 'Linked Bill',
      type: 'reference',
      to: [{type: 'bill'}],
    }),
    defineField({
      name: 'linkedOrder',
      title: 'Linked Order',
      type: 'reference',
      to: [{type: 'order'}],
      description: 'Associate when the expense is tied to a specific order.',
    }),
    defineField({
      name: 'notes',
      title: 'Internal Notes',
      type: 'text',
      rows: 2,
    }),
  ],
  preview: {
    select: {
      category: 'category',
      amount: 'amount',
      date: 'date',
      vendor: 'vendorName',
      status: 'status',
    },
    prepare({category, amount, date, vendor, status}) {
      const statusIcons: Record<string, string> = {
        pending: '⏳',
        paid: '✅',
        scheduled: '📅',
        cancelled: '❌',
      }
      const statusIcon =
        typeof status === 'string' ? statusIcons[status] ?? '' : ''
      const formattedAmount =
        typeof amount === 'number' ? `$${amount.toFixed(2)}` : amount ? `$${amount}` : '$0'
      const subtitle = date ? new Date(date).toLocaleDateString() : 'No date'
      return {
        title: `${statusIcon} ${vendor || category || 'Expense'} - ${formattedAmount}`,
        subtitle,
      }
    },
  },
})
