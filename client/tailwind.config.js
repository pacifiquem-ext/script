/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        neutral: {
          0: '#ffffff',
          25: '#fafafa',
          50: '#f5f5f5',
          100: '#f0f0f0',
          200: '#e6e6e6',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a',
        },
        primary: {
          base: '#00B258',
          darker: '#009348',
          dark: '#007a3c',
          'alpha-10': 'rgba(0,178,88,0.08)',
          'alpha-16': 'rgba(0,178,88,0.14)',
        },
        blue: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        success: {
          base: '#16a34a',
          light: '#bbf7d0',
          lighter: '#f0fdf4',
        },
        warning: {
          base: '#d97706',
          light: '#fde68a',
          lighter: '#fffbeb',
        },
        error: {
          base: '#dc2626',
          light: '#fecaca',
          lighter: '#fef2f2',
        },
        info: {
          base: '#0284c7',
          light: '#bae6fd',
          lighter: '#f0f9ff',
        },
      },
      boxShadow: {
        xs: '0 1px 2px rgba(0,0,0,0.05)',
        sm: '0 1px 3px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)',
        md: '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06)',
        lg: '0 10px 15px rgba(0,0,0,0.10), 0 4px 6px rgba(0,0,0,0.05)',
        xl: '0 20px 25px rgba(0,0,0,0.10), 0 10px 10px rgba(0,0,0,0.04)',
        '2xl': '0 25px 50px rgba(0,0,0,0.25)',
        'button-primary-focus': '0 0 0 3px rgba(10,10,10,0.12)',
      },
      borderRadius: {
        4: '4px',
        6: '6px',
        8: '8px',
        10: '10px',
        12: '12px',
        16: '16px',
        20: '20px',
        full: '9999px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      backgroundImage: {
        'primary-gradient':
          'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%), #00B258',
        'primary-gradient-hover':
          'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%), #009348',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeInUp: 'fadeInUp 0.5s ease both',
        fadeUp: 'fadeUp 0.15s ease',
      },
    },
  },
  plugins: [],
};
