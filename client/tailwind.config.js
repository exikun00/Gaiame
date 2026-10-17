/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'just-black': '#0e100f',
        'surface-cream': '#fffce1',
        'surface-50': '#7c7c6f',
        'surface-25': '#42433d',
        'off-black': '#191919',
        'shockingly-green': '#0ae448',
        'light-green': '#abff84',
        'orangey': '#ff8709',
        'pink': '#fec5fb',
        'lilac': '#9d95ff',
        'blue': '#00bae2',
        'core-green': '#dfffd1',
      },
      fontFamily: {
        mori: ['DM Sans', 'Inter Tight', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        cards: '8px',
        buttons: '100px',
        pills: '9999px',
      },
      maxWidth: {
        page: '1280px',
      },
    },
  },
  plugins: [],
};
