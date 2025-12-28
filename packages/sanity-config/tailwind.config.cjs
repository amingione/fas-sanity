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
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      spacing: {
        'space-1': '4px',
        'space-2': '8px',
        'space-3': '12px',
        'space-4': '16px',
        'space-5': '24px',
        'space-6': '32px',
        'space-7': '48px',
      },
      fontSize: {
        'text-body': ['16px', {lineHeight: '1.5'}],
        'text-meta': ['14px', {lineHeight: 'normal'}],
        'text-caption': ['12px', {lineHeight: 'normal'}],
        h1: ['30px', {lineHeight: '1.2'}],
        h2: ['24px', {lineHeight: '1.2'}],
        h3: ['20px', {lineHeight: '1.2'}],
      },
    },
  },
  plugins: [],
}
