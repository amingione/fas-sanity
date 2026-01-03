import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'productTable',
  title: 'Product Table',
  type: 'document',
  fields: [
    defineField({
      name: 'carts',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'cartId', type: 'string', readOnly: true},
            {name: 'status', type: 'string', readOnly: true},
            {name: 'email', type: 'string', readOnly: true},
            {name: 'name', type: 'string', readOnly: true},
            {name: 'phone', type: 'string', readOnly: true},
            {name: 'checkoutSessionId', type: 'string', readOnly: true},
            {name: 'expiredAt', type: 'datetime', readOnly: true},
            {name: 'livemode', type: 'boolean', readOnly: true},
            defineField({
              name: 'recovery',
              type: 'object',
              readOnly: true,
              fields: [
                {name: 'recovered', type: 'boolean', readOnly: true},
                {name: 'recoveredAt', type: 'datetime', readOnly: true},
                {name: 'recoveredSessionId', type: 'string', readOnly: true},
              ],
            }),
            {
              name: 'order',
              type: 'reference',
              to: [{type: 'order'}],
              hidden: true,
              readOnly: true,
            },
          ],
          validation: (Rule) =>
            Rule.custom((value: any) =>
              value?.order ? 'Carts may NEVER reference orders' : true,
            ),
        },
      ],
    }),
  ],
})
