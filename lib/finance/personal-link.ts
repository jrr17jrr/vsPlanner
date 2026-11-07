import type { FinancialPersonalLink, Profile, Space } from "@/types/database.types";

/**
 * Integração Financeiro da empresa ↔ Financeiro Pessoal (migration
 * 20261110100000). Regras puras, compartilhadas por servidor e telas.
 */

export const PERSONAL_PAYER_NAME = "Ricardo Júnior";

export const PERSONAL_LINK_MIGRATION_MESSAGE =
  "A integração com o Financeiro Pessoal ainda não está ativa no banco. Execute a migração 20261110100000_financial_personal_link.sql no Supabase (SQL Editor) e tente de novo.";

/**
 * Contas pessoais só aparecem para o próprio Ricardo Júnior: o dono do
 * espaço da empresa ou o perfil com esse nome. Qualquer outro membro
 * continua registrando "pago pelo Júnior" sem ver/mexer em contas pessoais
 * (o banco também recusa: a conta precisa ser do Pessoal de quem está logado).
 */
export function canPayWithPersonalAccounts(profile: Pick<Profile, "id" | "name">, businessSpace: Pick<Space, "owner_id" | "type">): boolean {
  if (businessSpace.type === "personal") return false;
  if (businessSpace.owner_id === profile.id) return true;
  return /j[uú]nior|ricardo/i.test(profile.name ?? "");
}

/** Vínculo ATIVO por pagamento da empresa e por lançamento pessoal. */
export function activeLinksIndex(links: FinancialPersonalLink[]) {
  const byBusinessPayment = new Map<string, FinancialPersonalLink>();
  const byPersonalPayment = new Map<string, FinancialPersonalLink>();
  for (const l of links) {
    if (l.status !== "ativo") continue;
    if (l.business_payment_id) byBusinessPayment.set(l.business_payment_id, l);
    if (l.personal_payment_id) byPersonalPayment.set(l.personal_payment_id, l);
  }
  return { byBusinessPayment, byPersonalPayment };
}

type PaymentLike = { id: string; amount: number; payment_date: string; account_id: string | null };

/** Diferença em dias entre duas datas YYYY-MM-DD. */
function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;
}

/**
 * Antes de um desconto retroativo: lançamentos pessoais da MESMA conta,
 * com o MESMO valor e data próxima (até `windowDays`) que ainda não estão
 * vinculados — provavelmente o mesmo gasto já registrado no Pessoal.
 * Ordenados do mais próximo para o mais distante.
 */
export function findPersonalDuplicateCandidates<T extends PaymentLike>(
  target: { amount: number; payment_date: string },
  accountId: string,
  personalPayments: T[],
  linkedPersonalPaymentIds: Set<string>,
  windowDays = 7
): T[] {
  const cents = (v: number) => Math.round(Number(v) * 100);
  return personalPayments
    .filter((p) => p.account_id === accountId)
    .filter((p) => cents(p.amount) === cents(target.amount))
    .filter((p) => !linkedPersonalPaymentIds.has(p.id))
    .filter((p) => daysBetween(p.payment_date, target.payment_date) <= windowDays)
    .sort((a, b) => daysBetween(a.payment_date, target.payment_date) - daysBetween(b.payment_date, target.payment_date));
}

/** Categoria usada quando nenhuma é escolhida (criada pelo banco se não existir). */
export const PERSONAL_DEFAULT_CATEGORY = "Pagamentos da Visionário Dev";
