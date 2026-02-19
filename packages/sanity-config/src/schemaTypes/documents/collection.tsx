import {defineArrayMember, defineField, defineType} from 'sanity'
import {PackageIcon} from '@sanity/icons'

export const collectionType = defineType({
  name: 'collection',
  title: 'Collection',
  type: 'document',
  icon: PackageIcon,
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'slug', type: 'slug', options: {source: 'title', maxLength: 96}}),
    defineField({name: 'summary', type: 'text', rows: 3}),
    defineField({name: 'showHero', type: 'boolean', initialValue: false}),
    defineField({name: 'hero', type: 'hero', hidden: ({document}) => !document?.showHero}),
    defineField({
      name: 'modules',
      type: 'array',
      of: [
        defineArrayMember({type: 'callout'}),
        defineArrayMember({type: 'callToAction'}),
        defineArrayMember({type: 'grid'}),
        defineArrayMember({type: 'imageWithProductHotspots'}),
        defineArrayMember({type: 'instagram'}),
      ],
    }),
    defineField({name: 'products', type: 'array', of: [{type: 'reference', to: [{type: 'product'}]}]}),
    defineField({name: 'seo', type: 'seo'}),
    defineField({name: 'medusaCollectionId', type: 'string', readOnly: true}),
    defineField({name: 'lastSyncedFromMedusa', type: 'datetime', readOnly: true}),
  ],
})
