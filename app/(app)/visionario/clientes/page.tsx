"use client";

import { useMemo, useState } from "react";
import { Plus, Users, Search } from "lucide-react";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { ClientCard } from "@/components/shared/client-card";
import { ClientFormDialog } from "@/components/forms/client-form-dialog";
import { clientMonthlyValue, clientLastPaymentStatus } from "@/lib/selectors";
import { useAuth } from "@/hooks/use-auth";

type FilterKey = "todos" | "ativos" | "inativos" | "pagos" | "pendentes" | "atrasados";

export default function ClientesPage() {
  const { mySpaces } = useAuth();
  const clients = useDbStore((s) => s.clients);
  const clientServices = useDbStore((s) => s.clientServices);
  const services = useDbStore((s) => s.services);
  const clientPayments = useDbStore((s) => s.clientPayments);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [formOpen, setFormOpen] = useState(false);

  const visionarioSpace = mySpaces.find((s) => s.slug === "visionario-dev");

  const enriched = useMemo(() => {
    return clients
      .filter((c) => c.spaceId === visionarioSpace?.id)
      .map((client) => {
        const monthlyValue = clientMonthlyValue({ clientServices }, client);
        const serviceNames = clientServices
          .filter((cs) => cs.clientId === client.id)
          .map((cs) => services.find((s) => s.id === cs.serviceId)?.name)
          .filter((n): n is string => !!n);
        const paymentStatus = clientLastPaymentStatus({ clientPayments }, client.id);
        return { client, monthlyValue, serviceNames, paymentStatus };
      });
  }, [clients, clientServices, services, clientPayments, visionarioSpace]);

  const filtered = enriched.filter(({ client, paymentStatus }) => {
    if (query && !client.name.toLowerCase().includes(query.toLowerCase()) && !client.company?.toLowerCase().includes(query.toLowerCase())) {
      return false;
    }
    switch (filter) {
      case "ativos": return client.status === "ativo";
      case "inativos": return client.status === "inativo";
      case "pagos": return paymentStatus === "pago";
      case "pendentes": return paymentStatus === "pendente";
      case "atrasados": return paymentStatus === "atrasado";
      default: return true;
    }
  });

  if (!visionarioSpace) return null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Clientes"
        description="Todos os clientes da Visionário Dev."
        actions={
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> Novo cliente
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
          <TabsList>
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="ativos">Ativos</TabsTrigger>
            <TabsTrigger value="inativos">Inativos</TabsTrigger>
            <TabsTrigger value="pagos">Pagos</TabsTrigger>
            <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
            <TabsTrigger value="atrasados">Atrasados</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente…"
            className="pl-8"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente encontrado"
          description="Ajuste os filtros ou cadastre um novo cliente."
          action={
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> Novo cliente
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(({ client, monthlyValue, serviceNames, paymentStatus }) => (
            <ClientCard
              key={client.id}
              client={client}
              monthlyValue={monthlyValue}
              serviceNames={serviceNames}
              paymentStatus={paymentStatus}
            />
          ))}
        </div>
      )}

      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} spaceId={visionarioSpace.id} />
    </div>
  );
}
