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
          DEFAULT: '#6060FF',
          base: '#6060FF',
          darker: '#4B4BED',
          dark: '#3A3AD4',
          selection: '#4F4FFE',
          border: '#4F4FFE',
          'alpha-8': 'rgba(96, 96, 255, 0.08)',
          'alpha-10': 'rgba(96, 96, 255, 0.10)',
          'alpha-16': 'rgba(96, 96, 255, 0.16)',
          'alpha-20': 'rgba(96, 96, 255, 0.20)',
          'alpha-82': 'rgba(96, 96, 255, 0.82)',
        },
        destructive: {
          base: '#FF4444',
          darker: '#E53E3E',
          dark: '#CC3333',
          border: '#FF5555',
        },
        surface: {
          chip: '#F1F2FF',
          hero: '#FBFBFF',
        },
        avatar: {
          placeholder: '#C7C7F5',
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
        chip: '0 4px 60px 0 rgba(0, 0, 0, 0.10)',
        'button-primary': '0px 10px 24px -8px rgba(58, 13, 240, 0.20)',
        'button-primary-hover': '0px 12px 28px -6px rgba(58, 13, 240, 0.28)',
        'button-destructive': '0px 10px 24px -8px rgba(255, 68, 68, 0.30)',
        'button-destructive-hover': '0px 12px 28px -6px rgba(255, 68, 68, 0.38)',
        'hero-screenshot': '0 4px 60px 0 rgba(0, 0, 0, 0.08)',
      },
      backdropBlur: {
        glass: '40px',
      },
      borderRadius: {
        4: '4px',
        6: '6px',
        8: '8px',
        10: '10px',
        12: '12px',
        16: '16px',
        20: '20px',
        21: '21px',
        full: '9999px',
      },
      fontFamily: {
        sans: ['"DM Mono"', 'ui-monospace', 'monospace'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['"DM Mono"', 'ui-monospace', 'monospace'],
      },
      backgroundImage: {
        'primary-gradient':
          'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%), #6060FF',
        'primary-gradient-hover':
          'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%), #4B4BED',
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
