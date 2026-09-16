export type PeriodPreset = "mes_atual" | "mes_passado" | "3m" | "6m" | "ano";

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  mes_atual: "Este mês",
  mes_passado: "Mês passado",
  "3m": "Últimos 3 meses",
  "6m": "Últimos 6 meses",
  ano: "Este ano",
};

export function monthKeysForPeriod(preset: PeriodPreset, base = new Date()): string[] {
  const keys: string[] = [];
  const push = (offset: number) => {
    const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  switch (preset) {
    case "mes_atual":
      push(0);
      break;
    case "mes_passado":
      push(-1);
      break;
    case "3m":
      push(-2); push(-1); push(0);
      break;
    case "6m":
      push(-5); push(-4); push(-3); push(-2); push(-1); push(0);
      break;
    case "ano":
      for (let m = 0; m <= base.getMonth(); m++) {
        const d = new Date(base.getFullYear(), m, 1);
        keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
      break;
  }
  return keys;
}

export function monthKeyLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}
