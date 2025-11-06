/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './sanity.config.ts',
    './src/components/**/*.{js,jsx,ts,tsx}',
    './src/schemaTypes/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
