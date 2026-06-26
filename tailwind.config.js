import daisyui from 'daisyui'
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [daisyui],
  daisyui: {
    themes: [
      {
        helm: {
          primary: '#1B3A6B',           // deep navy
          'primary-content': '#EFF4FB',
          secondary: '#C99A3B',         // brass gold — kept
          'secondary-content': '#2B2113',
          accent: '#2E6DA4',            // ocean blue
          neutral: '#1A2130',           // dark navy-grey
          'base-100': '#ebedf0',
          'base-200': '#dfe8f5',        // faint blue tint
          'base-300': '#DDE4EF',        // cool blue-grey
          'base-content': '#1A2130',
          info: '#2E7FC1',
          success: '#2F7D52',
          warning: '#C77B26',
          error: '#B3402F',
        },
      },
      {
        'helm-dark': {
          primary: '#4D8FD6',           // lifted ocean blue for dark contrast
          'primary-content': '#080E18',
          secondary: '#D9A94A',         // brass gold — kept
          'secondary-content': '#241B0C',
          accent: '#6AAED6',            // sky blue
          neutral: '#0C1220',           // very dark navy
          'base-100': '#141E2E',        // dark navy base
          'base-200': '#0E1624',
          'base-300': '#1E2D42',        // slightly lifted navy
          'base-content': '#E4ECF7',    // cool white with blue tint
          info: '#5BA3D9',
          success: '#4CAF7D',
          warning: '#E0A458',
          error: '#E0695A',
        },
      },
    ],
  },
}