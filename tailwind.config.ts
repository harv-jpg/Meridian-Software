import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    // Class strings also live in shared modules (e.g. the per-stage palette in
    // src/lib/stages.ts). Without this glob those classes are never generated.
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#10192E",
        paper: "#F6F4EF",
        teal: "#1F8A70",
        gold: "#C9A227",
        // Drafting only. Every other accent was already spoken for — `gold` is
        // the same hex as `stage.proposal`, so reusing it would have given two
        // landing-page cards the same bar.
        plum: "#6E5B8B",
        // The inbox, for the same reason: `stage.lead` is the Pipeline card's
        // bar, and a second card wearing it reads as an accident.
        sky: "#3B6EA5",
        // A full scale, not a single value. Defining `slate` as a bare string
        // replaces Tailwind's built-in scale, which silently voids every
        // `text-slate-500` in the app and flattens the whole type hierarchy.
        slate: {
          50: "#F4F6F9",
          100: "#E7EBF1",
          200: "#CFD6E1",
          300: "#AEB9CA",
          400: "#8593AB",
          500: "#5C6B85",
          600: "#48566C",
          700: "#3A4557",
          800: "#2A3242",
          900: "#1B2130",
        },
        // One accent per pipeline stage, so a card carries its status in
        // colour rather than only in which column it happens to sit in.
        stage: {
          lead: "#6B7FA8",
          proposal: "#C9A227",
          negotiating: "#D97706",
          won: "#1F8A70",
          lost: "#9B8F84",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,25,46,0.04), 0 1px 3px rgba(16,25,46,0.06)",
        lift: "0 4px 14px rgba(16,25,46,0.10), 0 2px 4px rgba(16,25,46,0.04)",
        drawer: "-16px 0 48px rgba(16,25,46,0.18)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        rise: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "slide-in": "slide-in 260ms cubic-bezier(0.32, 0.72, 0, 1)",
        rise: "rise 220ms ease-out both",
        shimmer: "shimmer 1.4s infinite",
      },
    },
  },
  plugins: [],
};
export default config;
