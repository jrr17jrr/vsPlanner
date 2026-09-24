import type {
  ClientService,
  ClientServiceStatus,
  FinancialKind,
  FinancialPaymentMethod,
  FinancialRecurrenceFrequency,
} from "@/types/database.types";
import type { ChargePaymentStatus } from "@/lib/financial-calc";
import { formatCurrency } from "@/lib/format";

/** Rótulos compartilhados do Financeiro/contratos — um lugar só pra não divergir entre telas. */

export const PAYMENT_METHOD_LABEL: Record<FinancialPaymentMethod, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  boleto: "Boleto",
  transferencia: "Transferência",
  outro: "Outro",
};

export const FREQUENCY_LABEL: Record<FinancialRecurrenceFrequency, string> = {
  semanal: "Semanal",
  mensal: "Mensal",
  a_cada_x_meses: "A cada X meses",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
  customizado: "Customizado",
};

/** Status do contrato: valores do banco (migration 005) → rótulos pedidos na UI. */
export const CONTRACT_STATUS_LABEL: Record<ClientServiceStatus, string> = {
  ativo: "Ativo",
  inativo: "Pausado",
  cancelado: "Encerrado",
};

export const CONTRACT_STATUS_BADGE: Record<ClientServiceStatus, string> = {
  ativo: "ativo",
  inativo: "pausado",
  cancelado: "encerrado",
};

export function contractBillingLabel(contract: Pick<ClientService, "billing_type" | "frequency" | "due_day" | "installment_count" | "price">): string {
  if (contract.billing_type === "recorrente") {
    const freq = FREQUENCY_LABEL[contract.frequency ?? "mensal"];
    return `${freq} · vence dia ${contract.due_day}`;
  }
  if (contract.billing_type === "parcelado") {
    const count = contract.installment_count ?? 1;
    return `Parcelado em ${count}x de ${formatCurrency(Number(contract.price) / count)}`;
  }
  return "Pagamento único";
}

export function contractPriceSuffix(contract: Pick<ClientService, "billing_type" | "frequency">): string {
  if (contract.billing_type !== "recorrente") return contract.billing_type === "parcelado" ? " total" : "";
  if (contract.frequency === "anual") return "/ano";
  if (contract.frequency === "semanal") return "/semana";
  return "/mês";
}

/** Badge de status de uma cobrança conforme o tipo (recebido x pago). */
export function chargeBadgeStatus(kind: FinancialKind, status: ChargePaymentStatus, overdue = false): string {
  if (status === "cancelado") return "cancelado";
  if (status === "pago") return kind === "entrada" ? "recebido" : "pago";
  if (status === "parcial") return "parcial";
  return overdue ? "atrasado" : "pendente";
}
