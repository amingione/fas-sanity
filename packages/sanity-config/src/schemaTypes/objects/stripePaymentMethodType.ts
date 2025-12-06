import {defineField, defineType} from 'sanity'

export const stripePaymentMethodType = defineType({
  name: 'stripePaymentMethod',
  title: 'Stripe Payment Method',
  type: 'object',
  fields: [
    defineField({name: 'id', title: 'Stripe Payment Method ID', type: 'string', readOnly: false}),
    defineField({name: 'type', title: 'Type', type: 'string', readOnly: false}),
    defineField({name: 'brand', title: 'Brand', type: 'string', readOnly: false}),
    defineField({name: 'last4', title: 'Last 4', type: 'string', readOnly: false}),
    defineField({name: 'expMonth', title: 'Exp. Month', type: 'number', readOnly: false}),
    defineField({name: 'expYear', title: 'Exp. Year', type: 'number', readOnly: false}),
    defineField({name: 'funding', title: 'Funding', type: 'string', readOnly: false}),
    defineField({name: 'fingerprint', title: 'Fingerprint', type: 'string', readOnly: false}),
    defineField({name: 'wallet', title: 'Wallet', type: 'string', readOnly: false}),
    defineField({name: 'customerId', title: 'Stripe Customer ID', type: 'string', readOnly: false}),
    defineField({name: 'billingName', title: 'Billing Name', type: 'string', readOnly: false}),
    defineField({name: 'billingEmail', title: 'Billing Email', type: 'string', readOnly: false}),
    defineField({name: 'billingZip', title: 'Billing ZIP', type: 'string', readOnly: false}),
    defineField({name: 'createdAt', title: 'Created At', type: 'datetime', readOnly: false}),
    defineField({name: 'livemode', title: 'Live Mode', type: 'boolean', readOnly: false}),
    defineField({name: 'isDefault', title: 'Default', type: 'boolean', readOnly: false}),
  ],
})
