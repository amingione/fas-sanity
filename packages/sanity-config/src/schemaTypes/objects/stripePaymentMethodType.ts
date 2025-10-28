import {defineField, defineType} from 'sanity'

export const stripePaymentMethodType = defineType({
  name: 'stripePaymentMethod',
  title: 'Stripe Payment Method',
  type: 'object',
  fields: [
    defineField({name: 'id', title: 'Stripe Payment Method ID', type: 'string', readOnly: true}),
    defineField({name: 'type', title: 'Type', type: 'string', readOnly: true}),
    defineField({name: 'brand', title: 'Brand', type: 'string', readOnly: true}),
    defineField({name: 'last4', title: 'Last 4', type: 'string', readOnly: true}),
    defineField({name: 'expMonth', title: 'Exp. Month', type: 'number', readOnly: true}),
    defineField({name: 'expYear', title: 'Exp. Year', type: 'number', readOnly: true}),
    defineField({name: 'funding', title: 'Funding', type: 'string', readOnly: true}),
    defineField({name: 'fingerprint', title: 'Fingerprint', type: 'string', readOnly: true}),
    defineField({name: 'wallet', title: 'Wallet', type: 'string', readOnly: true}),
    defineField({name: 'customerId', title: 'Stripe Customer ID', type: 'string', readOnly: true}),
    defineField({name: 'billingName', title: 'Billing Name', type: 'string', readOnly: true}),
    defineField({name: 'billingEmail', title: 'Billing Email', type: 'string', readOnly: true}),
    defineField({name: 'billingZip', title: 'Billing ZIP', type: 'string', readOnly: true}),
    defineField({name: 'createdAt', title: 'Created At', type: 'datetime', readOnly: true}),
    defineField({name: 'livemode', title: 'Live Mode', type: 'boolean', readOnly: true}),
    defineField({name: 'isDefault', title: 'Default', type: 'boolean', readOnly: true}),
  ],
})
