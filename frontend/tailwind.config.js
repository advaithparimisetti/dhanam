/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Roboto Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        dhanam: {
          base: '#050B08',
          dark: '#071014',
          panel: '#0A120E',
          elev: '#0E1813',
          card: 'rgba(255,255,255,0.02)',
          border: 'rgba(255,255,255,0.06)',
          primary: '#2D7A3E',
          accent: '#AEE7B1',
          pos: '#36C46F',
          neg: '#F0616D',
          warn: '#F5A623',
          info: '#4F9FFF',
          'text-hi': '#E6F0EA',
          'text-mid': '#9AA7A0',
          'text-lo': '#5F6C66',
        },
      },
      boxShadow: {
        bento: '0 8px 24px -12px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(45,122,62,0.4), 0 0 24px -4px rgba(45,122,62,0.35)',
      },
    },
  },
  plugins: [],
}
