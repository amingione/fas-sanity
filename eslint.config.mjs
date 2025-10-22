import studio from '@sanity/eslint-config-studio'

const nodeGlobals = {
  console: 'readonly',
  process: 'readonly',
  require: 'readonly',
  module: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  fetch: 'readonly',
}

export default [
  ...studio,
  {
    files: ['scripts/**/*.{js,ts}', 'netlify/**/*.{js,ts}', 'src/**/*.{js,ts,tsx}', 'utils/**/*.{js,ts,tsx}', 'plugins/**/*.{js,ts,tsx}', 'schemaTypes/**/*.{js,ts,tsx}', 'sanity.config.ts', 'sanity.cli.ts'],
    languageOptions: {
      globals: nodeGlobals,
    },
  },
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
]
