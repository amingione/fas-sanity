import {defineField, defineType} from 'sanity'
import {KEY_FEATURE_ICON_OPTIONS} from '../../constants/keyFeatureIcons'
import KeyFeatureIconInput from '../../components/inputs/KeyFeatureIconInput'

export const collapsibleFeatureType = defineType({
  name: 'collapsibleFeature',
  title: 'Key Feature',
  type: 'object',
  options: {collapsible: true, collapsed: true},
  fields: [
    defineField({
      name: 'title',
      title: 'Feature Title',
      type: 'string',
      validation: (Rule) => Rule.required().error('A title is required for each feature'),
    }),
    defineField({
      name: 'icon',
      title: 'Icon',
      type: 'string',
      description: 'Front-end icon identifier (coordinate with the storefront icon set)',
      options: {
        list: KEY_FEATURE_ICON_OPTIONS,
      },
      components: {
        input: KeyFeatureIconInput,
      },
    }),
    defineField({
      name: 'summary',
      title: 'Short Summary',
      type: 'text',
      rows: 2,
      description: 'One or two sentences that show while collapsed',
      validation: (Rule) => Rule.max(240),
    }),
    defineField({
      name: 'details',
      title: 'Expanded Details',
      type: 'array',
      of: [{type: 'block'}],
      description: 'Optional rich text displayed when customers expand the feature',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      icon: 'icon',
      summary: 'summary',
    },
    prepare({title, icon, summary}) {
      const subtitle = [icon, summary].filter(Boolean).join(' • ')
      return {
        title: title || 'Feature',
        subtitle: subtitle || 'Add copy to help shoppers understand the benefit',
      }
    },
  },
})
