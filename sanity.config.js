import { defineConfig } from 'sanity'
import { deskTool } from 'sanity/desk'
import { visionTool } from '@sanity/vision'
import { media } from 'sanity-plugin-media'
import { colorInput } from '@sanity/color-input'

import { schemaTypes } from './schemaTypes'
import { deskStructure } from './deskStructure'
import resolveDocumentActions from './resolveDocumentActions'
import ShippingCalendar from './components/studio/ShippingCalendar'

const isDev = process.env.NODE_ENV === 'development'

export default defineConfig({
  name: 'default',
  title: 'FAS Motorsports',

  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'r4og35qd',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',

  plugins: [
    deskTool({ structure: deskStructure }),
    colorInput(),
    media(),
    ...(isDev ? [visionTool()] : []),
  ],

  tools: [
    {
      name: 'shipping-calendar',
      title: 'Shipping Calendar',
      component: ShippingCalendar,
    },
  ],

  document: {
    actions: resolveDocumentActions,
  },

  schema: {
    types: schemaTypes,
  },
})