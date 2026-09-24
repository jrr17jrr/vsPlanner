import Link from "next/link";
import { ArrowRight, CheckCircle2, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { WhatsAppButton } from "@/components/visionario/reunioes/whatsapp-button";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ClientBillingSnapshot } from "@/lib/financial-calc";
import type { Client, FinancialCharge } from "@/types/database.types";

const SITUATION: Record<ClientBillingSnapshot["status"], { label: string; className: string; dot: string }> = {
  atrasado: { label: "Atrasado", className: "text-destructive", dot: "bg-destructive" },
  pendente: { label: "Pendente", className: "text-warning", dot: "bg-warning" },
  pago: { label: "Pago", className: "text-success", dot: "bg-success" },
  sem_cobranca: { label: "Sem cobrança", className: "text-muted-foreground", dot: "bg-muted-foreground/50" },
};

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Card do cliente na listagem. A situação financeira (`snapshot`) vem das
 * cobranças reais (`clientBillingSnapshot`) — null quando o usuário não
 * pode ver o Financeiro, e aí o bloco financeiro simplesmente não aparece.
 */
export function RealClientCard({
  client,
  monthlyValue,
  serviceNames,
  snapshot,
  canEditFinance = false,
  onMarkPaid,
  onUndo,
}: {
  client: Client;
  monthlyValue: number;
  serviceNames: string[];
  snapshot?: ClientBillingSnapshot | null;
  canEditFinance?: boolean;
  onMarkPaid?: (charge: FinancialCharge, remaining: number) => void;
  onUndo?: (charge: FinancialCharge) => void;
}) {
  const situation = snapshot ? SITUATION[snapshot.status] : null;
  const charge = snapshot?.charge ?? null;
  const open = snapshot && (snapshot.status === "atrasado" || snapshot.status === "pendente") && charge;

  let detail: string | null = null;
  if (snapshot?.status === "atrasado") {
    detail = plural(snapshot.daysLate, "dia", "dias");
    if (snapshot.overdueCount > 1) detail += ` · ${snapshot.overdueCount} cobranças (${formatCurrency(snapshot.overdueTotal)})`;
  } else if (snapshot?.status === "pendente") {
    detail = snapshot.daysUntilDue === 0 ? "Vence hoje" : `Vence em ${plural(snapshot.daysUntilDue, "dia", "dias")}`;
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/visionario/clientes/${client.id}`} className="hover:underline">
            <p className="truncate text-sm font-semibold text-foreground">{client.name}</p>
          </Link>
          {client.company && <p className="truncate text-xs text-muted-foreground">{client.company}</p>}
        </div>
        <StatusBadge status={client.status} className="shrink-0" />
      </div>

      {serviceNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {serviceNames.map((name, i) => (
            <span key={`${name}-${i}`} className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
              {name}
            </span>
          ))}
        </div>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Mensalidade</dt>
        <dd className="text-right font-medium tabular-nums text-foreground">
          {monthlyValue > 0 ? formatCurrency(monthlyValue) : "—"}
        </dd>
        {snapshot && (
          <>
            <dt className="text-muted-foreground">Vencimento</dt>
            <dd className="text-right tabular-nums text-foreground">{charge ? formatDate(charge.due_date) : "—"}</dd>
            {open && snapshot.remaining > 0 && Math.abs(snapshot.remaining - monthlyValue) > 0.009 && (
              <>
                <dt className="text-muted-foreground">Em aberto</dt>
                <dd className="text-right tabular-nums text-foreground">{formatCurrency(snapshot.remaining)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Situação</dt>
            <dd className="text-right">
              <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide", situation!.className)}>
                <span className={cn("h-2 w-2 rounded-full", situation!.dot)} aria-hidden />
                {situation!.label}
              </span>
              {detail && <span className={cn("block text-xs", situation!.className)}>{detail}</span>}
            </dd>
          </>
        )}
      </dl>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <WhatsAppButton phone={client.whatsapp || client.phone} />
        {canEditFinance && open && onMarkPaid && (
          <Button size="sm" variant="outline" onClick={() => onMarkPaid(charge, snapshot.remaining)}>
            <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden /> Marcar pago
          </Button>
        )}
        {canEditFinance && snapshot?.status === "pago" && charge && onUndo && (
          <Button size="sm" variant="ghost" onClick={() => onUndo(charge)} title="Voltar para pendente (marcado por engano)">
            <Undo2 className="h-3.5 w-3.5" aria-hidden /> Desfazer
          </Button>
        )}
        <Link
          href={`/visionario/clientes/${client.id}`}
          className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Abrir <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}
