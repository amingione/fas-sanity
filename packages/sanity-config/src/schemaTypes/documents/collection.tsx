import {defineArrayMember, defineField, defineType} from 'sanity'
import {PackageIcon} from '@sanity/icons'

export const collectionType = defineType({
  name: 'collection',
  title: 'Collection',
  type: 'document',
  icon: PackageIcon,
  groups: [
    {name: 'content', title: 'Content', default: true},
    {name: 'integration', title: 'Medusa Bridge'},
  ],
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required(), group: 'content'}),
    defineField({name: 'slug', type: 'slug', options: {source: 'title', maxLength: 96}, group: 'content'}),
    defineField({name: 'summary', type: 'text', rows: 3, group: 'content'}),
    defineField({name: 'showHero', type: 'boolean', initialValue: false, group: 'content'}),
    defineField({name: 'hero', type: 'hero', hidden: ({document}) => !document?.showHero, group: 'content'}),
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
      group: 'content',
    }),
    defineField({name: 'products', type: 'array', of: [{type: 'reference', to: [{type: 'product'}]}], group: 'content'}),
    defineField({name: 'seo', type: 'seo', group: 'content'}),
    defineField({
      name: 'medusaCollectionId',
      type: 'string',
      readOnly: true,
      description: 'Mirrored from Medusa – read-only. Set automatically by the Medusa → Sanity sync.',
      group: 'integration',
    }),
    defineField({
      name: 'lastSyncedFromMedusa',
      type: 'datetime',
      readOnly: true,
      description: 'Mirrored from Medusa – read-only. Timestamp of the last sync from Medusa.',
      group: 'integration',
    }),
  ],
})
