/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './sanity.config.ts',
    './components/**/*.{js,jsx,ts,tsx}',
    './schemaTypes/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
