import type { Config } from 'tailwindcss';
export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      colors: {
        // Derived from the supplied MYLA logo: navy, construction orange, slate blue.
        myla: {
          navy: '#03203F',
          navyDeep: '#01172D',
          orange: '#F58712',
          slate: '#51697B',
          mist: '#E9EEF4',
        },
        brand: {
          50: '#FFF7ED',
          100: '#FFECD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FBA24A',
          500: '#F58712',
          600: '#D9740B',
          700: '#B45D09',
          800: '#8F4A0A',
          900: '#743D0B',
        },
        ink: {
          50: '#F5F7FA',
          100: '#E9EEF4',
          200: '#D3DDE8',
          300: '#AFC0D2',
          400: '#7E96AE',
          500: '#5C738B',
          600: '#415A72',
          700: '#2C445C',
          800: '#1A3048',
          900: '#03203F',
          950: '#01172D',
        },
      },
      borderRadius: {
        none: '0px',
        sm: '3px',
        DEFAULT: '4px',
        md: '5px',
        lg: '6px',
        xl: '8px',
        '2xl': '10px',
        '3xl': '12px',
        full: '9999px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(3,32,63,.05)',
        panel: '0 14px 34px -20px rgba(3,32,63,.45)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        fadein: { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        fadein: 'fadein .15s ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
