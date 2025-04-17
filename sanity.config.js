import { defineConfig } from 'sanity'
import { deskTool } from 'sanity/desk'
import { visionTool } from '@sanity/vision'
import { media } from 'sanity-plugin-media'
import { colorInput } from '@sanity/color-input'
import { schemaTypes } from './schemaTypes'
import ShippingCalendar from './components/studio/ShippingCalendar'
import { createShippingLabel } from './schemaTypes/documentActions/invoiceActions'
import deskStructure from './deskStructure'

console.log('🔥 sanity.config.js is loading...');
console.log('🌍 NODE_ENV:', process.env.NODE_ENV);
console.log('🔑 process.env.SANITY_STUDIO_PROJECT_ID:', process.env.SANITY_STUDIO_PROJECT_ID);
console.log('🔑 process.env.SANITY_STUDIO_DATASET:', process.env.SANITY_STUDIO_DATASET);
console.log('🧪 VITE_SANITY_STUDIO_PROJECT_ID:', import.meta.env.VITE_SANITY_STUDIO_PROJECT_ID);
console.log('🧪 VITE_SANITY_STUDIO_DATASET:', import.meta.env.VITE_SANITY_STUDIO_DATASET);

const isDev = process.env.NODE_ENV === 'development'
const devOnlyPlugins = [visionTool()]

const basePlugins = [
  deskTool({
    structure: deskStructure,
  }),
  colorInput(),
  media(),
]

export default defineConfig({
  name: 'default',
  title: 'FAS Motorsports',
  projectId: import.meta.env.VITE_SANITY_STUDIO_PROJECT_ID || 'r4og35qd',
  dataset: import.meta.env.VITE_SANITY_STUDIO_DATASET || 'production',

  plugins: [
    deskTool({
      structure: deskStructure,
    }),
    colorInput(),
    media(),
    ...(isDev ? devOnlyPlugins : [])
  ],

  tools: [
    {
      name: 'shipping-calendar',
      title: 'Shipping Calendar',
      component: ShippingCalendar,
    },
  ],

  document: {
    actions: (prev, context) =>
      context.schemaType === 'invoice'
        ? [...prev, createShippingLabel]
        : prev
  },

  schema: {
    types: schemaTypes,
  }
})