import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-clash)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["var(--font-schabo)", "Arial Narrow", "sans-serif"],
      },
      // Paleta do Manual de Identidade Visual da TOCCA.
      colors: {
        marca: {
          DEFAULT: "#764A37",
          escuro: "#5E3A2B",
          amarelo: "#FAC668",
          borda: "#ECE8E3",
          cinza: "#E9E6E2",
          azul: "#2a6385",
          "azul-medio": "#5788C6",
          teal: "#98C7CA",
          lima: "#DFDC74",
          laranja: "#F59F56",
          coral: "#D26D69",
          lilas: "#B19AC6",
          vermelho: "#C6331B",
        },
      },
    },
  },
  plugins: [],
};

export default config;
