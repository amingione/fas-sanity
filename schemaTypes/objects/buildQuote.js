// /fas-sanity/schemaTypes/objects/buildQuote.js

export const buildQuoteType = {
    name: 'buildQuote',
    title: 'Build Quote',
    type: 'document',
    fields: [
      {
        name: 'vehicleModel',
        title: 'Vehicle Model',
        type: 'string',
      },
      {
        name: 'modifications',
        title: 'Modifications',
        type: 'array',
        of: [{ type: 'string' }],
      },
      {
        name: 'horsepower',
        title: 'Horsepower',
        type: 'number',
      },
      {
        name: 'price',
        title: 'Total Price',
        type: 'number',
      },
    ],
  }