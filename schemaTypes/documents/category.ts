
import { defineType, defineField } from 'sanity';

export default defineType({
  name: 'category',
  title: 'Category',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'title', maxLength: 96 },
      validation: Rule => Rule.required(),
    }),
    // Optional curated list of products for this category.
    // This matches existing documents that already have a `products` array of product references
    // and prevents Studio from showing an "Unknown field" warning.
    defineField({
      name: 'products',
      title: 'Products (curated)',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'product' }] }],
      description:
        'Optional curated list of products for this category. Products also reference categories themselves.',
    }),
  ],
});
