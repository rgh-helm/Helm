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
          primary: '#1B4332',
          'primary-content': '#F4F6F4',
          secondary: '#C99A3B',
          'secondary-content': '#2B2113',
          accent: '#3A6E5A',
          neutral: '#1A2421',
          'base-100': '#FFFFFF',
          'base-200': '#F3F4F1',
          'base-300': '#E3E5DF',
          'base-content': '#1A2421',
          info: '#3A6EA5',
          success: '#2F7D52',
          warning: '#C77B26',
          error: '#B3402F',
        },
      },
      {
        'helm-dark': {
          // Brighter than the light theme's primary/secondary — the same
          // hues read as muddy against a dark base, so they're lifted for
          // contrast rather than reused verbatim.
          primary: '#4FAE85',
          'primary-content': '#0B1411',
          secondary: '#D9A94A',
          'secondary-content': '#241B0C',
          accent: '#6BB39A',
          neutral: '#0F1714',
          'base-100': '#16201C',
          'base-200': '#101713',
          'base-300': '#26332D',
          'base-content': '#E7ECE8',
          info: '#6FA8DC',
          success: '#4CAF7D',
          warning: '#E0A458',
          error: '#E0695A',
        },
      },
    ],
  },
}