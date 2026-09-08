import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Ink — the admin surface. Deep, slightly blue-black; not pure grey.
        ink: {
          950: '#0B0E13', 900: '#11151C', 850: '#161B24', 800: '#1C222D',
          700: '#28313F', 600: '#3A4757', 500: '#556478', 400: '#7A8899',
          300: '#A3AEBC', 200: '#C9D1DA', 100: '#E6EAEF', 50: '#F5F7F9',
        },
        // Saffron — Kajeh's accent, drawn from the kitchen itself.
        saffron: {
          600: '#B4761B', 500: '#D9962A', 400: '#E8A33D', 300: '#F2BC69',
          200: '#F7D49B', 100: '#FBE9CB',
        },
        // Pistachio for healthy margins, pomegranate for losses.
        pistachio: { 500: '#5E9E5E', 400: '#7FB069', 300: '#A3C68C' },
        pomegranate: { 600: '#A32F2F', 500: '#C2413D', 400: '#D96A63' },
      },
      fontFamily: {
        sans: ['Vazirmatn', 'system-ui', 'sans-serif'],
        display: ['Vazirmatn', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.25rem' },
    },
  },
  plugins: [],
} satisfies Config;
