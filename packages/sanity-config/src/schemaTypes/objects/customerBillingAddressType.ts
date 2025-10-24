import {defineField, defineType} from 'sanity'
import AddressAutocompleteInput from '../../components/inputs/AddressAutocompleteInput'

export const customerBillingAddressType = defineType({
  name: 'customerBillingAddress',
  title: 'Billing Address',
  type: 'object',
  components: {input: AddressAutocompleteInput},
  fields: [
    defineField({name: 'name', title: 'Full Name', type: 'string'}),
    defineField({name: 'street', title: 'Street Address', type: 'string'}),
    defineField({name: 'city', title: 'City', type: 'string'}),
    defineField({name: 'state', title: 'State/Province', type: 'string'}),
    defineField({name: 'postalCode', title: 'Postal Code', type: 'string'}),
    defineField({name: 'country', title: 'Country', type: 'string'}),
  ],
})
