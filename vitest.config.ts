import {defineConfig} from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@fas/sanity-config': path.resolve(__dirname, 'packages/sanity-config/src'),
    },
  },
  test: {
    environment: 'node',
  },
})
