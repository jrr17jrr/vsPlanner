// Paleta de gráficos — segue os tokens definidos em app/globals.css (--chart-1..5),
// já validados para o tema escuro do produto (contraste e legibilidade).
export const CHART_COLORS = [
  "var(--chart-1)", // azul/ciano — série primária
  "var(--chart-2)", // verde — positivo/entradas
  "var(--chart-3)", // âmbar — atenção
  "var(--chart-4)", // violeta — categórico extra
  "var(--chart-5)", // vermelho — negativo/saídas
];

export const STATUS_COLORS = {
  success: "var(--success)",
  warning: "var(--warning)",
  destructive: "var(--destructive)",
  muted: "var(--muted-foreground)",
};
