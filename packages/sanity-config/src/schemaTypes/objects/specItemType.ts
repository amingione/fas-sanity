import { defineType, defineField } from 'sanity'

export const specItemType = defineType({
  name: 'specItem',
  title: 'Specification',
  type: 'object',
  fields: [
    defineField({ name: 'label', type: 'string', title: 'Label', validation: Rule => Rule.required().error('Label is required') }),
    defineField({ name: 'value', type: 'string', title: 'Value', validation: Rule => Rule.required().error('Value is required') }),
  ],
  preview: {
    select: { label: 'label', value: 'value' },
    prepare: ({ label, value }) => ({ title: label || '—', subtitle: String(value || '') })
  }
})

