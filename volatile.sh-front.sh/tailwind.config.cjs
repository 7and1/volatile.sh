/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./App.tsx",
    "./index.tsx",
    "./components/**/*.{ts,tsx}",
    "./utils/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "term-green": "var(--term-green)",
        "term-green-dim": "var(--term-green-dim)",
        "term-bg": "var(--term-bg)",
        "term-panel": "var(--term-panel)",
      },
      fontFamily: {
        mono: ['"VT323"', "monospace"],
      },
      animation: {
        blink: "blink 1s step-end infinite",
        "crt-flicker": "crtFlicker 0.15s infinite",
      },
      keyframes: {
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        crtFlicker: {
          "0%": { opacity: "0.97" },
          "100%": { opacity: "1" },
        },
      },
      // Mobile-first responsive utilities
      screens: {
        xs: "475px",
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1536px",
      },
    },
  },
  plugins: [],
};
