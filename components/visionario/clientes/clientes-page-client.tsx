"use client";

import { useMemo, useState } from "react";
import { Plus, Users, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { RealClientCard } from "@/components/visionario/clientes/real-client-card";
import { ClientFormDialog } from "@/components/visionario/clientes/client-form-dialog";
import { contractMonthlyValue } from "@/lib/financial-calc";
import type { Client, ClientService, Service, SpaceMemberProfile } from "@/types/database.types";

type FilterKey = "todos" | "ativos" | "inativos";

export function ClientesPageClient({
  clients,
  clientServices,
  services,
  members,
  permissions,
}: {
  clients: Client[];
  clientServices: ClientService[];
  services: Service[];
  members: SpaceMemberProfile[];
  permissions: { canCreate: boolean };
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [formOpen, setFormOpen] = useState(false);

  const serviceNameById = useMemo(() => new Map(services.map((s) => [s.id, s.name])), [services]);

  const enriched = useMemo(() => {
    return clients.map((client) => {
      const contracts = clientServices.filter((cs) => cs.client_id === client.id && cs.status === "ativo");
      // Mesma regra da Visão Geral/Financeiro (anual vira /12, pausado/encerrado não conta).
      const monthlyValue = contracts.reduce((sum, cs) => sum + contractMonthlyValue(cs), 0);
      const serviceNames = contracts
        .map((cs) => serviceNameById.get(cs.service_id))
        .filter((n): n is string => !!n);
      return { client, monthlyValue, serviceNames };
    });
  }, [clients, clientServices, serviceNameById]);

  const filtered = enriched.filter(({ client }) => {
    if (
      query &&
      !client.name.toLowerCase().includes(query.toLowerCase()) &&
      !client.company?.toLowerCase().includes(query.toLowerCase())
    ) {
      return false;
    }
    if (filter === "ativos") return client.status === "ativo";
    if (filter === "inativos") return client.status === "inativo";
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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
          <TabsList>
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="ativos">Ativos</TabsTrigger>
            <TabsTrigger value="inativos">Inativos</TabsTrigger>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(({ client, monthlyValue, serviceNames }) => (
            <RealClientCard key={client.id} client={client} monthlyValue={monthlyValue} serviceNames={serviceNames} />
          ))}
        </div>
      )}

      {permissions.canCreate && (
        <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} members={members} />
      )}
    </div>
  );
}
