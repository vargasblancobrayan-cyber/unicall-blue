/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-dm-sans)", "Inter", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#162033",
        muted: "#64748b",
        line: "#d8e1ef",
        panel: "#ffffff",
        soft: "#f4f7fb",
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#2563eb",
          600: "#1d4ed8",
          700: "#1e40af"
        },
        cyan: "#0ea5e9"
      },
      boxShadow: {
        panel: "0 1px 2px rgba(16, 24, 40, 0.04), 0 12px 36px rgba(30, 58, 95, 0.08)",
        "panel-lg": "0 2px 4px rgba(16, 24, 40, 0.05), 0 24px 60px rgba(30, 58, 95, 0.12)",
        "brand-glow": "0 8px 24px rgba(37, 99, 235, 0.28)"
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem"
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)"
      }
    }
  },
  plugins: []
};
