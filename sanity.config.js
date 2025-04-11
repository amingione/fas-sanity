import { defineConfig } from 'sanity'
import { deskTool } from 'sanity/desk'
import { visionTool } from '@sanity/vision'
import { media } from 'sanity-plugin-media'
import { colorInput } from '@sanity/color-input'
import { schemaTypes } from './schemaTypes'
import deskStructure from './deskStructure'

const isDev = process.env.NODE_ENV === 'development'
const devOnlyPlugins = [visionTool()]

const basePlugins = [
  deskTool({ structure: deskStructure }),
  colorInput(),
  media(),
]

export default defineConfig({
  name: 'default',
  title: 'FAS Motorsports',
  projectId: 'r4og35qd',
  dataset: 'production',

  plugins: [
    deskTool({ structure: deskStructure }),
    colorInput(),
    media(),
    ...(isDev ? devOnlyPlugins : [])
  ],

  schema: {
    types: schemaTypes,
  },
})