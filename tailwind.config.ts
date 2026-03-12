/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        heading: ["SpaceGrotesk-Medium", "cursive"],
        body: ["Inter_18pt-Regular", "sans-serif"],
      },
      colors: {
        surface: {
          light: "#ffffff",
          dark: "#000000",
          "card-light": "#ffffff",
          "card-dark": "#000000",
        },
        accent: {
          DEFAULT: "#7c8dba",
          light: "#7c8dba",
          dark: "#94a3d1",
        },
      },
      gridTemplateColumns: {
        layout: "1fr 2fr",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
