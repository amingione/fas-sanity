import {defineArrayMember, defineField, defineType} from 'sanity'

export const schemaOrganizationType = defineType({
  name: 'schemaOrganization',
  title: 'Schema.org Organization',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'legalName',
      title: 'Legal name',
      type: 'string',
    }),
    defineField({
      name: 'url',
      title: 'Website URL',
      type: 'url',
    }),
    defineField({
      name: 'logo',
      title: 'Logo',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'address',
      title: 'Address',
      type: 'schemaPostalAddress',
    }),
    defineField({
      name: 'contactEmail',
      title: 'Contact email',
      type: 'email',
    }),
    defineField({
      name: 'contactPhone',
      title: 'Contact phone',
      type: 'string',
    }),
    defineField({
      name: 'sameAs',
      title: 'Same As profiles',
      type: 'array',
      of: [defineArrayMember({type: 'url'})],
    }),
  ],
  preview: {
    select: {
      title: 'name',
    },
    prepare({title}) {
      return {
        title: title || 'Organization schema',
      }
    },
  },
})
