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
    files: [
      'scripts/**/*.{js,ts}',
      'netlify/**/*.{js,ts}',
      'packages/hydrogen-sanity/src/**/*.{js,ts,tsx}',
      'packages/sanity-config/src/**/*.{js,ts,tsx}',
      'packages/sanity-config/sanity.config.ts',
      'packages/sanity-config/sanity.cli.ts',
      'sanity.config.ts',
      'sanity.cli.ts'
    ],
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
