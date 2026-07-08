import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        chalk: "#FAFAF7",
        graphite: "#1C1C1A",
        hold: {
          DEFAULT: "#2FB56A",
          dark: "#1F8A50",
        },
        coral: "#F0663C",
        amber: "#E0921A",
      },
      borderRadius: {
        card: "16px",
      },
    },
  },
  plugins: [],
} satisfies Config;
