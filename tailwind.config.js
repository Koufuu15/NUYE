/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      colors: {
        paper: '#fbf9f6',
        ink: '#292724',
        terra: '#c76f51',
        sand: '#eee8e0',
      },
      fontFamily: {
        sans: ['DM Sans', 'Noto Sans JP', 'sans-serif'],
        serif: ['Noto Serif JP', 'serif'],
      },
    },
  },
  plugins: [],
}
