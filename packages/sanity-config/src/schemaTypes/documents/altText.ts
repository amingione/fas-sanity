import {defineType, defineField} from 'sanity'
import AltTextInput from '../components/AltTextInput'

const altText = defineType({
  name: 'altText',
  title: 'Alt Text Variation',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Variation Name',
      type: 'string',
      description: 'A short, descriptive name for this alt text variation (e.g., "Engine Bay Shot - Powerstroke")',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'text',
      title: 'Alternative Text',
      type: 'string',
      components: {
        input: AltTextInput,
      },
      description: 'The actual alt text string for accessibility and SEO (e.g., "FAS Motorsports 6.7L Powerstroke High-Flow Piping Kit installed in a 2022 Ford F-250 engine bay.")',
      validation: (Rule) => Rule.required().min(10).max(125).warning('Alt text should be descriptive (10-125 characters recommended).'),
    }),
    defineField({
      name: 'description',
      title: 'Usage Notes',
      type: 'text',
      rows: 2,
      description: 'Notes on when and where to use this specific alt text variation.',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'text',
    },
    prepare({title, subtitle}) {
      return {
        title: title,
        subtitle: subtitle,
      }
    },
  },
})

export default altText
