import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * Neutral ramp, conventional direction: 50 lightest, 950 darkest.
         * Tinted very slightly green so the neutrals sit with the brand rather
         * than reading as a separate grey system.
         */
        ink: {
          0: '#FFFFFF',
          50: '#F2F7F4',
          100: '#E6EFEA',
          200: '#D2E2DA',
          300: '#B2CBC0',
          400: '#7E9E8F',
          500: '#5C7C6C',
          600: '#456253',
          700: '#33493E',
          800: '#20332A',
          900: '#12211B',
          950: '#0A1410',
        },
        /** Forest green — the brand. */
        forest: {
          50: '#E8F5EE',
          100: '#CCE9D9',
          200: '#9AD4B6',
          300: '#5FB98D',
          400: '#2E9C6A',
          500: '#1B7D52',
          600: '#136240',
          700: '#0F4A31',
          800: '#0C3826',
          900: '#08251A',
        },
        /** Azure — the secondary, for data and links. */
        azure: {
          50: '#E7F1FD',
          100: '#CCE1FB',
          200: '#9CC6F6',
          300: '#63A5EF',
          400: '#2E84E4',
          500: '#1367C6',
          600: '#0D509E',
          700: '#0A3D78',
          800: '#082D58',
          900: '#051D39',
        },
        /** Semantic: profit, caution, loss. Distinct from the brand hue. */
        pistachio: { 300: '#7FCB9E', 400: '#3FA96C', 500: '#2A8452', 600: '#1E6640' },
        amber: { 300: '#F0C36B', 400: '#DE9F26', 500: '#B87C14', 600: '#8F5F0E' },
        pomegranate: { 300: '#EE9B96', 400: '#DB5B54', 500: '#C0332C', 600: '#992722' },
      },
      fontFamily: {
        sans: ['Vazirmatn', 'system-ui', 'sans-serif'],
        display: ['Vazirmatn', 'system-ui', 'sans-serif'],
      },
      fontSize: { '2xs': ['0.6875rem', { lineHeight: '1rem' }] },
      borderRadius: { xl: '0.875rem', '2xl': '1.25rem' },
      backdropBlur: { glass: '18px' },
      boxShadow: {
        glass: '0 8px 32px -8px rgba(8, 37, 26, 0.14), 0 2px 8px -2px rgba(8, 37, 26, 0.06)',
        'glass-lg': '0 20px 56px -12px rgba(8, 37, 26, 0.20), 0 4px 12px -4px rgba(8, 37, 26, 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config;
