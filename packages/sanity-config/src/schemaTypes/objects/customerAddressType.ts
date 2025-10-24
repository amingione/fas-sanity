import {defineField, defineType} from 'sanity'
import AddressAutocompleteInput from '../../components/inputs/AddressAutocompleteInput'

export const customerAddressType = defineType({
  name: 'customerAddress',
  title: 'Address',
  type: 'object',
  components: {input: AddressAutocompleteInput},
  fields: [
    defineField({name: 'label', title: 'Label (e.g. Home, Office)', type: 'string'}),
    defineField({name: 'street', title: 'Street Address', type: 'string'}),
    defineField({name: 'city', title: 'City', type: 'string'}),
    defineField({name: 'state', title: 'State', type: 'string'}),
    defineField({name: 'zip', title: 'ZIP Code', type: 'string'}),
    defineField({name: 'country', title: 'Country', type: 'string'}),
  ],
})
