/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f1117',
          raised: '#161a22',
          overlay: '#1c2230',
          border: '#2a3140',
        },
        ink: {
          DEFAULT: '#e8ecf4',
          muted: '#8b95a8',
          dim: '#5c667a',
        },
        accent: {
          DEFAULT: '#f0b429',
          dim: '#c4921f',
          soft: 'rgba(240, 180, 41, 0.12)',
        },
        ok: '#3dd68c',
        danger: '#f07178',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'Cascadia Code', 'Segoe UI Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(240, 180, 41, 0.15)',
      },
    },
  },
  plugins: [],
}
