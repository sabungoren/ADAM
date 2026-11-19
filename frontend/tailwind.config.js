/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        dark: {
          950: '#06090e',
          900: '#0b0f17',
          850: '#101726',
          800: '#162032',
          700: '#1f2d45',
          600: '#2d3f5e',
        },
        brand: {
          500: '#06b6d4',
          600: '#0891b2',
          400: '#22d3ee',
        }
      },
    },
  },
  plugins: [],
}
