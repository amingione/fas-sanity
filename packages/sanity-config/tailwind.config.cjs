/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './sanity.config.ts',
    './src/components/**/*.{js,jsx,ts,tsx}',
    './src/schemaTypes/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
