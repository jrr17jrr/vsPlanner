"use client";

import { useMemo, useState } from "react";
import { Plus, Users, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { AsyncConfirmDialog } from "@/components/shared/async-confirm-dialog";
import { RealClientCard } from "@/components/visionario/clientes/real-client-card";
import { ClientFormDialog } from "@/components/visionario/clientes/client-form-dialog";
import { MarkPaymentDialog } from "@/components/visionario/financeiro/mark-payment-dialog";
import { clientBillingSnapshot, contractMonthlyValue, type ClientBillingSnapshot } from "@/lib/financial-calc";
import { undoChargePaymentsAction } from "@/lib/supabase/financial-actions";
import { todayKeySaoPaulo } from "@/lib/format";
import type {
  Client,
  ClientService,
  FinancialAccount,
  FinancialCharge,
  FinancialPayment,
  Service,
  SpaceMemberProfile,
} from "@/types/database.types";

type FilterKey = "todos" | "ativos" | "inativos";
type FinanceFilter = "todos" | "pagos" | "pendentes" | "atrasados";

export function ClientesPageClient({
  clients,
  clientServices,
  services,
  members,
  charges,
  payments,
  accounts,
  permissions,
}: {
  clients: Client[];
  clientServices: ClientService[];
  services: Service[];
  members: SpaceMemberProfile[];
  charges: FinancialCharge[];
  payments: FinancialPayment[];
  accounts: FinancialAccount[];
  permissions: { canCreate: boolean; canViewFinance: boolean; canEditFinance: boolean };
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [financeFilter, setFinanceFilter] = useState<FinanceFilter>("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [paying, setPaying] = useState<{ charge: FinancialCharge; remaining: number } | null>(null);
  const [undoing, setUndoing] = useState<{ charge: FinancialCharge; clientName: string } | null>(null);

  const today = todayKeySaoPaulo();
  const serviceNameById = useMemo(() => new Map(services.map((s) => [s.id, s.name])), [services]);

  const enriched = useMemo(() => {
    return clients.map((client) => {
      const contracts = clientServices.filter((cs) => cs.client_id === client.id && cs.status === "ativo");
      // Mesma regra da Visão Geral/Financeiro (anual vira /12, pausado/encerrado não conta).
      const monthlyValue = contracts.reduce((sum, cs) => sum + contractMonthlyValue(cs), 0);
      const serviceNames = contracts
        .map((cs) => serviceNameById.get(cs.service_id))
        .filter((n): n is string => !!n);
      const snapshot: ClientBillingSnapshot | null = permissions.canViewFinance
        ? clientBillingSnapshot(client.id, charges, payments, today)
        : null;
      return { client, monthlyValue, serviceNames, snapshot };
    });
  }, [clients, clientServices, serviceNameById, charges, payments, today, permissions.canViewFinance]);

  const counts = useMemo(
    () => ({
      pagos: enriched.filter((e) => e.snapshot?.status === "pago").length,
      pendentes: enriched.filter((e) => e.snapshot?.status === "pendente").length,
      atrasados: enriched.filter((e) => e.snapshot?.status === "atrasado").length,
    }),
    [enriched]
  );

  const filtered = enriched.filter(({ client, snapshot }) => {
    if (
      query &&
      !client.name.toLowerCase().includes(query.toLowerCase()) &&
      !client.company?.toLowerCase().includes(query.toLowerCase())
    ) {
      return false;
    }
    if (filter === "ativos" && client.status !== "ativo") return false;
    if (filter === "inativos" && client.status !== "inativo") return false;
    if (financeFilter === "pagos" && snapshot?.status !== "pago") return false;
    if (financeFilter === "pendentes" && snapshot?.status !== "pendente") return false;
    if (financeFilter === "atrasados" && snapshot?.status !== "atrasado") return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Clientes"
        description="Clientes reais do Visionário Dev."
        actions={
          permissions.canCreate ? (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> Novo cliente
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
            <TabsList aria-label="Status do cliente">
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="ativos">Ativos</TabsTrigger>
              <TabsTrigger value="inativos">Inativos</TabsTrigger>
            </TabsList>
          </Tabs>
          {permissions.canViewFinance && (
            <Tabs value={financeFilter} onValueChange={(v) => setFinanceFilter(v as FinanceFilter)}>
              <TabsList aria-label="Situação financeira">
                <TabsTrigger value="todos">Todas situações</TabsTrigger>
                <TabsTrigger value="pagos">Pagos ({counts.pagos})</TabsTrigger>
                <TabsTrigger value="pendentes">Pendentes ({counts.pendentes})</TabsTrigger>
                <TabsTrigger value="atrasados">Atrasados ({counts.atrasados})</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
        <div className="relative w-full lg:w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente…"
            aria-label="Buscar cliente"
            className="pl-8"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente encontrado"
          description={permissions.canCreate ? "Ajuste os filtros ou cadastre um novo cliente." : "Ajuste os filtros."}
          action={
            permissions.canCreate ? (
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" /> Novo cliente
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ client, monthlyValue, serviceNames, snapshot }) => (
            <RealClientCard
              key={client.id}
              client={client}
              monthlyValue={monthlyValue}
              serviceNames={serviceNames}
              snapshot={snapshot}
              canEditFinance={permissions.canEditFinance}
              onMarkPaid={(charge, remaining) => setPaying({ charge, remaining })}
              onUndo={(charge) => setUndoing({ charge, clientName: client.name })}
            />
          ))}
        </div>
      )}

      {permissions.canCreate && (
        <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} members={members} />
      )}
      {paying && (
        <MarkPaymentDialog
          scope="visionario"
          charge={paying.charge}
          remaining={paying.remaining}
          accounts={accounts}
          onOpenChange={(open) => !open && setPaying(null)}
        />
      )}
      {undoing && (
        <AsyncConfirmDialog
          open
          onOpenChange={(open) => !open && setUndoing(null)}
          title={`Voltar a cobrança de ${undoing.clientName} para pendente?`}
          description="Os pagamentos registrados nesta cobrança são removidos e o saldo da conta volta ao que era. Use quando o pagamento foi marcado por engano."
          confirmLabel="Marcar como pendente"
          onConfirm={() => undoChargePaymentsAction("visionario", undoing.charge.id)}
        />
      )}
    </div>
  );
}
