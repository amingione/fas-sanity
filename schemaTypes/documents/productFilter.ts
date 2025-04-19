export default {
    name: 'productFilter',
    title: 'Product Filter',
    type: 'document',
    fields: [
      {
        name: 'title',
        title: 'Filter Name',
        type: 'string'
      },
      {
        name: 'slug',
        title: 'Slug',
        type: 'slug',
        options: { source: 'title' }
      },
      {
        name: 'filterType',
        title: 'Filter Type',
        type: 'string',
        options: {
          list: ['Vehicle', 'Tune', 'Horsepower', 'Category', 'Custom'],
          layout: 'dropdown'
        }
      },
      {
        name: 'products',
        title: 'Linked Products',
        type: 'array',
        of: [{ type: 'reference', to: [{ type: 'product' }] }]
      }
    ]
  }