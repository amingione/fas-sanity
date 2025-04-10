import { defineConfig } from 'sanity'
import { deskTool } from '@sanity/desk-tool'
import { visionTool } from '@sanity/vision'
import { media, mediaAssetSource } from 'sanity-plugin-media'
import { colorInput } from '@sanity/color-input'
import { customDocumentActions } from './your/path'
import { schemaTypes } from './schemaTypes'
import deskStructure from './deskStructure'

const isDev = process.env.NODE_ENV === 'development'
const devOnlyPlugins = [visionTool()]

export default defineConfig({
  name: 'default',
  title: 'FAS Motorsports',

  projectId: 'r4og35qd',
  dataset: 'production',

  plugins: [
    deskTool({ structure: deskStructure }),
    colorInput(),
    customDocumentActions(),
    media(),
    ...(isDev ? devOnlyPlugins : [])
  ],

  schema: {
    types: schemaTypes,
  },

  form: {
    file: {
      assetSources: (previousAssetSources) => {
        return previousAssetSources.filter(
          (assetSource) => assetSource !== mediaAssetSource
        )
      },
    },
    image: {
      assetSources: (previousAssetSources) => {
        return previousAssetSources.filter(
          (assetSource) => assetSource === mediaAssetSource
        )
      },
    },
  },

  studio: {
    components: {
      navbar: Navbar,
    },
  },
})