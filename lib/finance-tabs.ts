/** Abas do Financeiro — módulo comum (usado pelo servidor para ler `?aba=` e pelo client). */
/** `categorias` (Gastos por categoria) só existe no Meu Dinheiro (scope pessoal). */
export type FinanceTab = "visao" | "categorias" | "movimentacoes" | "a_receber" | "a_pagar" | "config";

const TABS: FinanceTab[] = ["visao", "categorias", "movimentacoes", "a_receber", "a_pagar", "config"];

/** Aba inicial via `?aba=` (links do dashboard direto para A receber/A pagar). */
export function parseFinanceTab(value: string | undefined): FinanceTab {
  return TABS.includes(value as FinanceTab) ? (value as FinanceTab) : "visao";
}
