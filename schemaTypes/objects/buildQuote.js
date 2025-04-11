import { defineType } from 'sanity'
import { SendIcon } from '@sanity/icons'

export const buildQuote = defineType({
  name: 'buildQuote',
  title: 'Build Quote',
  type: 'document',
  fields: [
    { name: 'vehicleModel', title: 'Vehicle Model', type: 'string' },
    { name: 'modifications', title: 'Modifications', type: 'array', of: [{ type: 'string' }] },
    { name: 'horsepower', title: 'Horsepower', type: 'number' },
    { name: 'price', title: 'Total Price', type: 'number' },
    { name: 'userEmail', title: 'User Email', type: 'string' },
    {
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      readOnly: true,
    },
    {
      name: 'modList',
      title: 'Mod List',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'name', type: 'string', title: 'Mod Name' },
            { name: 'hpGain', type: 'number', title: 'HP Gain' },
            { name: 'price', type: 'number', title: 'Mod Price' },
          ],
        },
      ],
    },
    {
      name: 'quoteSent',
      title: 'Quote Sent?',
      type: 'boolean',
      initialValue: false
    }
  ],
  actions: (prev, context) => {
    return [
      ...prev,
      {
        label: 'Send Quote Email',
        icon: SendIcon,
        onHandle: async () => {
          if (context.document.quoteSent) {
            alert('Quote has already been sent.')
            return
          }

          const res = await fetch('/.netlify/functions/sendQuoteEmail', {
            method: 'POST',
            body: JSON.stringify({ quoteId: context.document._id }),
            headers: {
              'Content-Type': 'application/json'
            }
          })

          if (res.ok) {
            alert('Quote sent successfully!')
            // Optionally patch quoteSent = true (requires Sanity client)
          } else {
            alert('Error sending quote.')
          }
        }
      }
    ]
  }
})