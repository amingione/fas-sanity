import {defineType, defineField} from 'sanity'
import CheckActions from '../../components/bill.ts/CheckActions'
import {StringInputProps} from 'sanity'

const AdaptedCheckActionsWrapper = (props: StringInputProps) => {
  const doc = (props as any)?.document
  return <CheckActions doc={doc} />
}

export default defineType({
  name: 'bill',
  title: 'Bill / Payable',
  type: 'document',
  fields: [
    defineField({
      name: 'vendor',
      title: 'Vendor',
      type: 'reference',
      to: [{type: 'vendor'}],
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'string',
    }),
    defineField({
      name: 'amount',
      title: 'Amount',
      type: 'number',
    }),
    defineField({
      name: 'dueDate',
      title: 'Due Date',
      type: 'date',
    }),
    defineField({
      name: 'paid',
      title: 'Paid',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'paidDate',
      title: 'Paid Date',
      type: 'datetime',
    }),
    defineField({
      name: 'checkNumber',
      title: 'Check Number',
      type: 'string',
    }),
    defineField({
      name: 'printCheck',
      title: '🧾 Print Check',
      type: 'string',
      readOnly: true,
      components: {
        input: AdaptedCheckActionsWrapper,
      },
    }),
  ],
})
