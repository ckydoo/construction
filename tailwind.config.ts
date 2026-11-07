import type { Config } from 'tailwindcss';
export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#fffbeb',100:'#fef3c7',200:'#fde68a',300:'#fcd34d',400:'#fbbf24',500:'#f59e0b',600:'#d97706',700:'#b45309',800:'#92400e',900:'#78350f' },
        ink: { 50:'#f8fafc',100:'#f1f5f9',200:'#e2e8f0',300:'#cbd5e1',400:'#94a3b8',500:'#64748b',600:'#475569',700:'#334155',800:'#1e293b',900:'#0f172a',950:'#020617' }
      },
      boxShadow: { card:'0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.18)' },
      keyframes: { shimmer:{ '100%':{transform:'translateX(100%)'} }, fadein:{from:{opacity:'0',transform:'translateY(4px)'},to:{opacity:'1',transform:'none'}} },
      animation: { shimmer:'shimmer 1.6s infinite', fadein:'fadein .18s ease-out' }
    }
  },
  plugins: []
} satisfies Config;
