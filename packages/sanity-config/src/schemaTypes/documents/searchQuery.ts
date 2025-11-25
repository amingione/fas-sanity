import {defineField, defineType} from 'sanity'

export const searchQueryType = defineType({
  name: 'searchQuery',
  type: 'document',
  title: 'Search Queries',
  icon: () => '🔍',
  readOnly: true,
  fields: [
    defineField({name: 'query', type: 'string', title: 'Search Query', validation: (Rule) => Rule.required()}),
    defineField({name: 'timestamp', type: 'datetime', title: 'Timestamp'}),
    defineField({name: 'resultCount', type: 'number', title: 'Results Found'}),
    defineField({name: 'clickedProducts', type: 'array', title: 'Clicked Products', of: [{type: 'reference', to: [{type: 'product'}]}]}),
    defineField({
      name: 'filters',
      type: 'object',
      title: 'Applied Filters',
      fields: [
        {name: 'category', type: 'string'},
        {name: 'priceRange', type: 'string'},
        {name: 'rating', type: 'number'},
        {name: 'inStock', type: 'boolean'},
      ],
    }),
    defineField({name: 'sortBy', type: 'string', title: 'Sort Order'}),
    defineField({name: 'sessionId', type: 'string', title: 'Session ID'}),
    defineField({name: 'customerId', type: 'reference', title: 'Customer', to: [{type: 'customer'}]}),
    defineField({name: 'converted', type: 'boolean', title: 'Led to Purchase', description: 'Did this search result in a purchase?'}),
  ],
  preview: {
    select: {
      query: 'query',
      results: 'resultCount',
      timestamp: 'timestamp',
    },
    prepare({query, results, timestamp}) {
      return {
        title: query,
        subtitle: `${results} results • ${timestamp ? new Date(timestamp).toLocaleString() : ''}`,
      }
    },
  },
})

export default searchQueryType
