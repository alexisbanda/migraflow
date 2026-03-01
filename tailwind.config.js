/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Verde militar elegante (acento principal / CTAs)
        military: {
          50:  '#f2f5e8',
          100: '#e0e8c8',
          200: '#c3d196',
          300: '#a3b864',
          400: '#849f3c',
          500: '#6b8229',
          600: '#4b5320',   // base accent
          700: '#3a4119',
          800: '#2a2f12',
          900: '#1a1e0b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [],
}
