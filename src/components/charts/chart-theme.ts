/**
 * FitWell Hub - Chart Theme & Color Tokens
 * Cores hexadecimais e rgba nativas para renderização perfeita em SVG no Recharts,
 * eliminando falhas de parsing de variáveis CSS 'oklch' ou 'hsl'.
 */

export const chartColors = {
  // Cores principais (Paleta Dark Athletic)
  primary: "#2dd4a8", // Neon Mint principal
  primaryLight: "#73ffb8", // Mint brilhante (acento/halo)
  secondary: "#38bdf8", // Ciano / Azul atlético (Músculo / Cargas)
  accent: "#818cf8", // Indigo suave
  destructive: "#f43f5e", // Coral / Vermelho (Gordura / Alertas)
  warning: "#fbbf24", // Âmbar / Amarelo (Carboidratos)
  purple: "#c084fc", // Roxo / Violeta (Gorduras em macros)
  muted: "#94a3b8", // Cinza médio para textos e eixos

  // Elementos estruturais do gráfico
  grid: "rgba(255, 255, 255, 0.07)",
  border: "rgba(255, 255, 255, 0.12)",
  cardBg: "rgba(24, 27, 28, 0.95)",
  cardBorder: "rgba(255, 255, 255, 0.15)",
  glowShadow: "0 0 12px rgba(45, 212, 168, 0.35)",

  // Macros específicos
  macros: {
    protein: "#2dd4a8", // Mint
    carbs: "#fbbf24", // Âmbar
    fat: "#f43f5e", // Coral
    calories: "#2dd4a8",
  },

  // Métricas corporais
  body: {
    muscle: "#38bdf8", // Ciano / Azul atlético
    fat: "#f43f5e", // Coral / Vermelho
    weight: "#2dd4a8", // Mint
  },
} as const;

export const chartDefaults = {
  axisStyle: {
    fontSize: 10,
    fontWeight: 500,
    fill: "#94a3b8",
  },
  margin: {
    top: 10,
    right: 12,
    left: 0,
    bottom: 4,
  },
} as const;
