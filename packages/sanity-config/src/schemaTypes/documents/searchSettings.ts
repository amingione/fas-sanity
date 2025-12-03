import {defineField, defineType} from 'sanity'

export const searchSettingsType = defineType({
  name: 'searchSettings',
  type: 'document',
  title: 'Search Configuration',
  icon: () => '🔍',
  // @ts-expect-error Allow restricting document actions even though the type no longer declares it
  __experimental_actions: ['update', 'publish'],
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      title: 'Settings Title',
      initialValue: 'Search Configuration',
      readOnly: true,
    }),
    defineField({
      name: 'searchProvider',
      type: 'string',
      title: 'Search Provider',
      description: 'Which search service to use',
      options: {
        list: [
          {title: 'Algolia', value: 'algolia'},
          {title: 'Elasticsearch', value: 'elasticsearch'},
          {title: 'Typesense', value: 'typesense'},
          {title: 'Built-in (GROQ)', value: 'groq'},
        ],
        layout: 'radio',
      },
      initialValue: 'groq',
    }),
    defineField({
      name: 'algoliaConfig',
      type: 'object',
      title: 'Algolia Configuration',
      hidden: ({document}) => document?.searchProvider !== 'algolia',
      fields: [
        {name: 'applicationId', type: 'string', title: 'Application ID'},
        {name: 'searchApiKey', type: 'string', title: 'Search-Only API Key'},
        {name: 'indexName', type: 'string', title: 'Index Name', initialValue: 'products'},
      ],
    }),
    defineField({
      name: 'searchableFields',
      type: 'object',
      title: 'Searchable Fields',
      description: 'Which product fields to search',
      fields: [
        defineField({
          name: 'title',
          type: 'object',
          title: 'Product Title',
          fields: [
            {name: 'enabled', type: 'boolean', title: 'Searchable', initialValue: true},
            {
              name: 'weight',
              type: 'number',
              title: 'Weight',
              description: 'Higher = more important (1-10)',
              validation: (Rule) => Rule.min(1).max(10),
              initialValue: 10,
            },
          ],
        }),
        defineField({
          name: 'description',
          type: 'object',
          title: 'Description',
          fields: [
            {name: 'enabled', type: 'boolean', title: 'Searchable', initialValue: true},
            {name: 'weight', type: 'number', title: 'Weight', validation: (Rule) => Rule.min(1).max(10), initialValue: 5},
          ],
        }),
        defineField({
          name: 'sku',
          type: 'object',
          title: 'SKU',
          fields: [
            {name: 'enabled', type: 'boolean', title: 'Searchable', initialValue: true},
            {name: 'weight', type: 'number', title: 'Weight', validation: (Rule) => Rule.min(1).max(10), initialValue: 8},
          ],
        }),
        defineField({
          name: 'tags',
          type: 'object',
          title: 'Tags',
          fields: [
            {name: 'enabled', type: 'boolean', title: 'Searchable', initialValue: true},
            {name: 'weight', type: 'number', title: 'Weight', validation: (Rule) => Rule.min(1).max(10), initialValue: 6},
          ],
        }),
        defineField({
          name: 'categories',
          type: 'object',
          title: 'Categories',
          fields: [
            {name: 'enabled', type: 'boolean', title: 'Searchable', initialValue: true},
            {name: 'weight', type: 'number', title: 'Weight', validation: (Rule) => Rule.min(1).max(10), initialValue: 7},
          ],
        }),
      ],
    }),
    defineField({
      name: 'synonyms',
      type: 'array',
      title: 'Search Synonyms',
      description: 'Help customers find products with alternative terms',
      of: [
        defineField({
          type: 'object',
          name: 'synonymGroup',
          fields: [
            {
              name: 'terms',
              type: 'array',
              title: 'Synonym Terms',
              description: 'Words that mean the same thing',
              of: [{type: 'string'}],
              validation: (Rule) => Rule.required().min(2),
            },
            {
              name: 'type',
              type: 'string',
              title: 'Synonym Type',
              options: {
                list: [
                  {title: 'Two-way (all terms are equal)', value: 'synonym'},
                  {title: 'One-way (first term is primary)', value: 'oneway'},
                ],
              },
              initialValue: 'synonym',
            },
          ],
          preview: {
            select: {terms: 'terms', type: 'type'},
            prepare({terms, type}) {
              const arrow = type === 'oneway' ? ' → ' : ' ↔ '
              return {
                title: terms?.join(arrow) || 'Empty synonym group',
              }
            },
          },
        }),
      ],
    }),
    defineField({name: 'stopWords', type: 'array', title: 'Stop Words', description: 'Words to ignore in search (e.g., "the", "a", "an")', of: [{type: 'string'}]}),
    defineField({
      name: 'boostingRules',
      type: 'array',
      title: 'Boosting Rules',
      description: 'Promote certain products in search results',
      of: [
        defineField({
          type: 'object',
          name: 'boostRule',
          fields: [
            {name: 'name', type: 'string', title: 'Rule Name', validation: (Rule) => Rule.required()},
            {
              name: 'condition',
              type: 'string',
              title: 'Condition',
              description: 'When to apply this boost',
              options: {
                list: [
                  {title: 'Specific products', value: 'products'},
                  {title: 'Products with tag', value: 'tag'},
                  {title: 'Products in category', value: 'category'},
                  {title: 'High-rated products', value: 'rating'},
                  {title: 'Best sellers', value: 'best_sellers'},
                  {title: 'New arrivals', value: 'new'},
                  {title: 'On sale', value: 'sale'},
                ],
              },
            },
            {
              name: 'products',
              type: 'array',
              title: 'Specific Products',
              of: [{type: 'reference', to: [{type: 'product'}]}],
              hidden: ({parent}) => parent?.condition !== 'products',
            },
            {name: 'tag', type: 'string', title: 'Tag', hidden: ({parent}) => parent?.condition !== 'tag'},
            {
              name: 'category',
              type: 'reference',
              title: 'Category',
              to: [{type: 'category'}],
              hidden: ({parent}) => parent?.condition !== 'category',
            },
            {
              name: 'boostFactor',
              type: 'number',
              title: 'Boost Factor',
              description: 'Multiplier for relevance score (1.0 = no boost, 2.0 = double)',
              validation: (Rule) => Rule.min(0.1).max(10),
              initialValue: 1.5,
            },
            {name: 'enabled', type: 'boolean', title: 'Enabled', initialValue: true},
          ],
          preview: {
            select: {name: 'name', condition: 'condition', boost: 'boostFactor', enabled: 'enabled'},
            prepare({name, condition, boost, enabled}) {
              return {
                title: name,
                subtitle: `${condition} • ${boost}x boost${enabled ? '' : ' (disabled)'}`,
              }
            },
          },
        }),
      ],
    }),
    defineField({
      name: 'filters',
      type: 'object',
      title: 'Search Filters',
      description: 'Available filters for search results',
      fields: [
        {name: 'enableCategoryFilter', type: 'boolean', title: 'Enable Category Filter', initialValue: true},
        {name: 'enablePriceFilter', type: 'boolean', title: 'Enable Price Filter', initialValue: true},
        {
          name: 'priceRanges',
          type: 'array',
          title: 'Price Ranges',
          description: 'Predefined price ranges for filtering',
          of: [
            defineField({
              name: 'priceRange',
              type: 'object',
              fields: [
                {name: 'label', type: 'string', title: 'Label', placeholder: 'e.g., "Under $100"'},
                {name: 'min', type: 'number', title: 'Min Price'},
                {name: 'max', type: 'number', title: 'Max Price'},
              ],
            }),
          ],
          hidden: ({parent}) => !parent?.enablePriceFilter,
        },
        {name: 'enableRatingFilter', type: 'boolean', title: 'Enable Rating Filter', initialValue: true},
        {name: 'enableAvailabilityFilter', type: 'boolean', title: 'Enable In Stock Filter', initialValue: true},
        {
          name: 'customFilters',
          type: 'array',
          title: 'Custom Filters',
          description: 'Additional filters based on product attributes',
          of: [
            defineField({
              name: 'customFilter',
              type: 'object',
              fields: [
                {name: 'label', type: 'string', title: 'Filter Label', placeholder: 'e.g., "Vehicle Type"'},
                {name: 'field', type: 'string', title: 'Product Field', description: 'Field name to filter on', placeholder: 'e.g., "vehicleType"'},
                {
                  name: 'type',
                  type: 'string',
                  title: 'Filter Type',
                  options: {
                    list: [
                      {title: 'Checkbox (multiple)', value: 'checkbox'},
                      {title: 'Radio (single)', value: 'radio'},
                      {title: 'Range slider', value: 'range'},
                    ],
                  },
                },
              ],
            }),
          ],
        },
      ],
    }),
    defineField({
      name: 'sorting',
      type: 'object',
      title: 'Sort Options',
      fields: [
        {
          name: 'defaultSort',
          type: 'string',
          title: 'Default Sort',
          options: {
            list: [
              {title: 'Relevance', value: 'relevance'},
              {title: 'Newest First', value: 'newest'},
              {title: 'Price: Low to High', value: 'price_asc'},
              {title: 'Price: High to Low', value: 'price_desc'},
              {title: 'Best Selling', value: 'best_selling'},
              {title: 'Highest Rated', value: 'rating'},
            ],
          },
          initialValue: 'relevance',
        },
        {
          name: 'availableSorts',
          type: 'array',
          title: 'Available Sort Options',
          description: 'Which sort options to show to customers',
          of: [
            defineField({
              name: 'sortOption',
              type: 'string',
              options: {
                list: [
                  {title: 'Relevance', value: 'relevance'},
                  {title: 'Newest First', value: 'newest'},
                  {title: 'Price: Low to High', value: 'price_asc'},
                  {title: 'Price: High to Low', value: 'price_desc'},
                  {title: 'Best Selling', value: 'best_selling'},
                  {title: 'Highest Rated', value: 'rating'},
                  {title: 'Alphabetical A-Z', value: 'alpha_asc'},
                  {title: 'Alphabetical Z-A', value: 'alpha_desc'},
                ],
              },
            }),
          ],
        },
      ],
    }),
    defineField({
      name: 'suggestions',
      type: 'object',
      title: 'Search Suggestions',
      fields: [
        {name: 'enableAutocomplete', type: 'boolean', title: 'Enable Autocomplete', initialValue: true},
        {
          name: 'maxSuggestions',
          type: 'number',
          title: 'Max Suggestions',
          description: 'Number of autocomplete suggestions to show',
          validation: (Rule) => Rule.integer().min(3).max(10),
          initialValue: 5,
        },
        {name: 'enablePopularSearches', type: 'boolean', title: 'Show Popular Searches', initialValue: true},
        {
          name: 'popularSearches',
          type: 'array',
          title: 'Popular Search Terms',
          description: 'Manually curated popular searches',
          of: [{type: 'string'}],
          hidden: ({parent}) => !parent?.enablePopularSearches,
        },
      ],
    }),
    defineField({
      name: 'analytics',
      type: 'object',
      title: 'Search Analytics',
      fields: [
        {name: 'trackSearchQueries', type: 'boolean', title: 'Track Search Queries', description: 'Log all search queries for analysis', initialValue: true},
        {name: 'trackNoResults', type: 'boolean', title: 'Track No-Result Searches', description: 'Identify searches that return no results', initialValue: true},
        {name: 'trackClickThroughs', type: 'boolean', title: 'Track Click-Throughs', description: 'Track which products are clicked from search', initialValue: true},
      ],
    }),
  ],
  preview: {
    prepare() {
      return {
        title: 'Search Configuration',
      }
    },
  },
})

export default searchSettingsType
