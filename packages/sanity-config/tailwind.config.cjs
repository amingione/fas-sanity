/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './packages/sanity-config/index.html',
    './packages/sanity-config/sanity.config.ts',
    './packages/sanity-config/src/components/**/*.{js,jsx,ts,tsx}',
    './packages/sanity-config/src/schemaTypes/**/*.{js,jsx,ts,tsx}',
    './packages/sanity-config/src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
