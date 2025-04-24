import { defineType, defineField } from 'sanity';

export default defineType({
  name: 'productFilter',
  title: 'Product Filter',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Filter Name',
      type: 'string'
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'title' }
    }),
    defineField({
      name: 'filterType',
      title: 'Filter Type',
      type: 'string',
      options: {
        list: ['Vehicle', 'Tune', 'Horsepower', 'Category', 'Custom'],
        layout: 'dropdown'
      }
    }),
    defineField({
      name: 'products',
      title: 'Linked Products',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'product' }] }]
    })
  ],
  preview: {
    select: {
      title: 'title',
      productCount: 'products'
    },
    prepare(selection) {
      const { title, productCount } = selection;
      return {
        title,
        subtitle: `${productCount?.length || 0} linked product(s)`
      };
    }
  }
});