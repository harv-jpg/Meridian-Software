import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#10192E",
        paper: "#F6F4EF",
        teal: "#1F8A70",
        slate: "#5C6B85",
        gold: "#C9A227",
      },
    },
  },
  plugins: [],
};
export default config;
