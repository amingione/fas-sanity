import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { media } from 'sanity-plugin-media'
import { visionTool } from '@sanity/vision'
import { deskStructure } from './deskStructure'
import resolveDocumentActions from './resolveDocumentActions'
import { schemaTypes } from './schemaTypes' // ✅ Import your schemas
// NOTE: Removed @sanity/color-input (v3-only) and switched to structureTool for Sanity v4

const isDev = process.env.NODE_ENV === 'development'

export default defineConfig({
  name: 'default',
  title: 'FAS Motorsports',
  projectId: 'r4og35qd',
  dataset: 'production',
  plugins: [
    structureTool({ structure: deskStructure }),
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