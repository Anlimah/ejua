/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ejua: {
          50:  '#fef2f4',
          100: '#fde6e9',
          200: '#fbd0d8',
          300: '#f7aab9',
          400: '#f17a93',
          500: '#e94560', // Primary brand
          600: '#d62550',
          700: '#b41842',
          800: '#96173d',
          900: '#801739',
          950: '#47071b',
        },
        navy: {
          50:  '#f0f1f8',
          100: '#dddff0',
          200: '#c3c5e3',
          300: '#9a9dd1',
          400: '#7a7cbe',
          500: '#5c5ca8',
          600: '#4a488e',
          700: '#3e3b74',
          800: '#363361',
          900: '#1a1a2e', // Secondary dark
          950: '#0d0d18',
        },
        gold: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'slide-up': 'slideUp 0.5s ease-out',
        'fade-in': 'fadeIn 0.4s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
};
