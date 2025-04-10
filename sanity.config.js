import { defineConfig } from 'sanity'
import { deskTool } from 'sanity/desk'
import deskStructure from './deskStructure'
import { visionTool } from '@sanity/vision'
import { media } from 'sanity-plugin-media'
import { structureTool } from 'sanity/structure'
import { colorInput } from '@sanity/color-input'
import { customDocumentActions } from './your/path'
import { schemaTypes } from './schemaTypes'

const devOnlyPlugins = [visionTool()]

export default defineConfig({
  name: 'default',
  title: 'FAS Motorsports',

  projectId: 'r4og35qd',
  dataset: 'production',

  plugins: [
    deskTool({ structure: deskStructure }), // custom desk layout
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
        return previousAssetSources.filter((assetSource) => assetSource !== mediaAssetSource)
      },
    },
    image: {
      assetSources: (previousAssetSources) => {
        return previousAssetSources.filter((assetSource) => assetSource === mediaAssetSource)
      },
    },
  },

  studio: {
    components: {
      navbar: Navbar,
    },
  },
})