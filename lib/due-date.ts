import { todayKeySaoPaulo } from "@/lib/format";

export type DueBucket = "concluido" | "sem_prazo" | "atrasado" | "vence_hoje" | "proximo";

/**
 * Classificação de vencimento ÚNICA pro projeto inteiro fora do
 * Financeiro (que tem a própria, mais rica, em `lib/financial-calc.ts` —
 * "atrasado" ali também considera pagamento parcial). Usada por Tarefas,
 * Trabalho/CLT, Comissões, Sites & Domínios — nunca cada tela calculando
 * "atrasado" do seu próprio jeito.
 */
export function classifyDueDate(dueDate: string | null, done: boolean, today: string = todayKeySaoPaulo()): DueBucket {
  if (done) return "concluido";
  if (!dueDate) return "sem_prazo";
  if (dueDate < today) return "atrasado";
  if (dueDate === today) return "vence_hoje";
  return "proximo";
}

/** Dias até a data (negativo se já passou) — usado em cards/badges de prazo. */
export function daysUntil(dateIso: string | null | undefined): number | null {
  if (!dateIso) return null;
  const [y, m, d] = dateIso.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
