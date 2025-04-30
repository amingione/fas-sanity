import { defineConfig } from 'sanity'
import { deskTool } from 'sanity/desk'
import { colorInput } from '@sanity/color-input'
import { media } from 'sanity-plugin-media'
import { visionTool } from '@sanity/vision'
import { deskStructure } from './deskStructure'
import resolveDocumentActions from './resolveDocumentActions'
import { schemaTypes } from './schemaTypes' // ✅ Import your schemas

const isDev = process.env.NODE_ENV === 'development'

export default defineConfig({
  name: 'default',
  title: 'FAS Motorsports',
  projectId: 'r4og35qd',
  dataset: 'production',
  plugins: [
    deskTool({ structure: deskStructure }),
    colorInput(),
    media(),
    ...(isDev ? [visionTool()] : []),
  ],
  schema: {
    types: schemaTypes, // ✅ Register your schemas
  },
  studio: {
    unstable__disableLiveEdit: true,
  }
})