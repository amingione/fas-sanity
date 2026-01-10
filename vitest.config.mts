import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  resolve: {
    alias: {
      '@fas/sanity-config': path.resolve(__dirname, 'packages/sanity-config/src'),
    },
  },
  test: {
    cacheDir: './node_modules/.vitest',
    environment: 'node',
    env: {
      SANITY_STUDIO_PROJECT_ID: 'test-project',
      SANITY_STUDIO_DATASET: 'test-dataset',
      SANITY_API_TOKEN: 'test-token',
    },
  },
})
