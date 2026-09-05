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
        panel: "0 12px 36px rgba(30, 58, 95, 0.08)"
      }
    }
  },
  plugins: []
};
