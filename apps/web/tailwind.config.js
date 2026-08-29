/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./app.jsx",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        accent: {
          cyan: '#06b6d4',
          emerald: '#10b981',
          violet: '#8b5cf6',
        }
      },
      boxShadow: {
        'glass': '0 20px 40px -15px rgba(0, 0, 0, 0.05), 0 0 15px 0 rgba(0, 0, 0, 0.03)',
        'glass-hover': '0 30px 60px -12px rgba(37, 99, 235, 0.12), 0 0 20px 0 rgba(0, 0, 0, 0.04)',
      }
    },
  },
  plugins: [],
}
