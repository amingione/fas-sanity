import {defineField, defineType} from 'sanity'
import AddressAutocompleteInput from '../../components/inputs/AddressAutocompleteInput'

export const shippingAddressType = defineType({
  name: 'shippingAddress',
  title: 'Shipping Address',
  type: 'object',
  components: {input: AddressAutocompleteInput},
  options: {
    collapsible: true,
    collapsed: true,
  },
  fields: [
    defineField({name: 'name', type: 'string', title: 'Recipient Name'}),
    defineField({name: 'phone', type: 'string', title: 'Phone Number'}),
    defineField({name: 'email', type: 'string', title: 'Email'}),
    defineField({name: 'addressLine1', type: 'string', title: 'Address Line 1'}),
    defineField({name: 'addressLine2', type: 'string', title: 'Address Line 2'}),
    defineField({name: 'city', type: 'string', title: 'City'}),
    defineField({name: 'state', type: 'string', title: 'State'}),
    defineField({name: 'postalCode', type: 'string', title: 'ZIP/Postal Code'}),
    defineField({name: 'country', type: 'string', title: 'Country Code'}),
  ],
})
