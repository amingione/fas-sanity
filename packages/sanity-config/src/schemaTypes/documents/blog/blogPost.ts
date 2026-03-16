import {defineArrayMember, defineField, defineType} from 'sanity'

export default defineType({
  name: 'post',
  title: 'Blog Post',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      validation: (Rule) => Rule.required(),
    }),
    defineField({name: 'authorName', title: 'Author Name', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({
      name: 'featuredImage',
      title: 'Featured Image',
      type: 'image',
      options: {hotspot: true},
      fields: [
        defineField({name: 'alt', type: 'string', title: 'Alternative text'}),
      ],
    }),
    defineField({name: 'excerpt', title: 'Excerpt', type: 'text', rows: 3, validation: (Rule) => Rule.max(160)}),
    defineField({
      name: 'content',
      title: 'Content',
      type: 'array',
      of: [
        defineArrayMember({type: 'block'}),
        defineArrayMember({
          type: 'image',
          options: {hotspot: true},
          fields: [
            defineField({name: 'alt', type: 'string', title: 'Alternative text'}),
            defineField({name: 'caption', type: 'string', title: 'Caption'}),
          ],
        }),
        defineArrayMember({type: 'code', options: {language: 'javascript'}}),
      ],
    }),
    defineField({name: 'categories', title: 'Categories', type: 'array', of: [{type: 'reference', to: [{type: 'blogCategory'}]}]}),
    defineField({name: 'tags', title: 'Tags', type: 'array', of: [{type: 'string'}], options: {layout: 'tags'}}),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {list: ['draft', 'published', 'scheduled', 'archived'], layout: 'radio'},
      initialValue: 'draft',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published At',
      type: 'datetime',
      validation: (Rule) =>
        Rule.custom((value, context) => {
          const status = (context?.document as any)?.status
          if (status === 'published' && !value) {
            return 'Published At is required when status is "published"'
          }
          return true
        }),
    }),
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'object',
      fields: [
        defineField({name: 'metaTitle', title: 'Meta Title', type: 'string', validation: (Rule) => Rule.max(60)}),
        defineField({name: 'metaDescription', title: 'Meta Description', type: 'text', rows: 3, validation: (Rule) => Rule.max(160)}),
        defineField({name: 'keywords', title: 'Keywords', type: 'array', of: [{type: 'string'}]}),
      ],
    }),
    defineField({name: 'relatedProducts', title: 'Related Products', type: 'array', of: [{type: 'reference', to: [{type: 'product'}]}]}),
    defineField({name: 'readTime', title: 'Estimated Read Time (minutes)', type: 'number'}),
    defineField({name: 'featured', title: 'Featured Post', type: 'boolean', initialValue: false}),
  ],
  preview: {
    select: {title: 'title', author: 'authorName', media: 'featuredImage', status: 'status'},
    prepare({title, author, media, status}) {
      return {title, subtitle: `${status} • by ${author || 'Unknown'}`, media}
    },
  },
})
