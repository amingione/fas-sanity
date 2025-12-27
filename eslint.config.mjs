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
  {
    ignores: [
      '.netlify/**',
      '**/.netlify/**',
      '.sanity/**',
      '**/.sanity/**',
      'dist/static/**',
      '**/dist/static/**',
      'scripts/**',
    ],
  },
  ...studio,
  {
    files: [
      'scripts/**/*.{js,ts,cjs}',
      '*.cjs',
      '*.js',
      'netlify/**/*.{js,ts}',
      'shared/**/*.{js,ts,tsx}',
      'packages/sanity-config/src/**/*.{js,ts,tsx}',
      'packages/sanity-config/sanity.config.ts',
      'packages/sanity-config/sanity.cli.ts',
      'sanity.config.ts',
      'sanity.cli.ts',
    ],
    languageOptions: {
      globals: nodeGlobals,
      sourceType: 'module',
    },
  },
  {
    files: ['packages/sanity-config/src/schemaTypes/documentActions/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
]
