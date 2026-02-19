/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{js,ts,jsx,tsx}',
    './hooks/**/*.{js,ts,jsx,tsx}',
    './services/**/*.{js,ts,jsx,tsx}',
    './modals/**/*.{js,ts,jsx,tsx}',
    './engines/**/*.{js,ts,jsx,tsx}',
    './styles/**/*.{css,scss}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
        ],
        display: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
      colors: {
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        bg: 'rgb(var(--bg) / <alpha-value>)',
        bg2: 'rgb(var(--bg2) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        surface2: 'rgb(var(--surface2) / <alpha-value>)',
        stroke: 'rgb(var(--stroke) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        accent2: 'rgb(var(--accent2) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
      },
      boxShadow: {
        lift: '0 24px 80px rgb(0 0 0 / 0.28), 0 10px 30px rgb(0 0 0 / 0.18)',
        liftSoft: '0 18px 60px rgb(0 0 0 / 0.18), 0 8px 20px rgb(0 0 0 / 0.12)',
        ring: '0 0 0 1px rgb(var(--stroke) / 0.9), 0 10px 30px rgb(0 0 0 / 0.12)',
        glow: '0 0 0 1px rgb(var(--stroke) / 0.8), 0 0 0 6px rgb(var(--accent) / 0.14)',
      },
      borderRadius: {
        xl2: '20px',
        xl3: '28px',
      },
      keyframes: {
        aurora: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        floaty: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        typingDot: {
          '0%, 60%, 100%': { transform: 'translateY(0)' },
          '30%': { transform: 'translateY(-4px)' },
        },
      },
      animation: {
        aurora: 'aurora 16s ease infinite',
        shimmer: 'shimmer 1.7s linear infinite',
        floaty: 'floaty 7s ease-in-out infinite',
        typingDot: 'typingDot 1.4s infinite ease-in-out both',
      },
    },
  },
  plugins: [],
};
