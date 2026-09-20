"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Plus,
  Trash2,
  Mail,
  Phone,
  AtSign,
  Globe,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmActionButton } from "@/components/shared/confirm-action-button";
import { WhatsAppButton } from "@/components/visionario/reunioes/whatsapp-button";
import { ClientFormDialog } from "@/components/visionario/clientes/client-form-dialog";
import { ContractServiceDialog } from "@/components/visionario/clientes/contract-service-dialog";
import { deleteClientAction } from "@/lib/supabase/clients-actions";
import { deleteClientServiceAction } from "@/lib/supabase/client-services-actions";
import { formatCurrency, formatDate, formatDateLong, toDateKey } from "@/lib/format";
import type {
  Client,
  ClientService,
  Meeting,
  Service,
  SpaceMemberProfile,
} from "@/types/database.types";

const FREQUENCY_LABEL: Record<string, string> = {
  semanal: "Semanal",
  mensal: "Mensal",
  anual: "Anual",
};

export function ClientDetailClient({
  client,
  contracts,
  services,
  meetings,
  members,
  permissions,
}: {
  client: Client;
  contracts: ClientService[];
  services: Service[];
  meetings: Meeting[];
  members: SpaceMemberProfile[];
  permissions: {
    canEditClient: boolean;
    canDeleteClient: boolean;
    canCreateContract: boolean;
    canEditContract: boolean;
    canDeleteContract: boolean;
  };
}) {
  const router = useRouter();
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [contractFormOpen, setContractFormOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<ClientService | undefined>();

  const activeServices = services.filter((s) => s.status === "ativo");

  const serviceById = new Map(services.map((s) => [s.id, s]));
  const responsibleName = client.responsible_id
    ? members.find((m) => m.id === client.responsible_id)?.name
    : undefined;

  const activeContracts = contracts.filter((c) => c.status !== "cancelado");
  const monthlyValue = activeContracts
    .filter((c) => c.billing_type === "recorrente" && c.frequency === "mensal")
    .reduce((sum, c) => sum + c.price, 0);

  const todayKey = toDateKey(new Date());
  const nextMeeting = meetings
    .filter((m) => (m.status === "agendada" || m.status === "em_andamento") && m.meeting_date >= todayKey)
    .sort((a, b) => (a.meeting_date + a.start_time).localeCompare(b.meeting_date + b.start_time))[0];

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" className="w-fit" onClick={() => router.push("/visionario/clientes")}>
        <ArrowLeft className="h-4 w-4" /> Voltar para clientes
      </Button>

      <PageHeader
        title={client.name}
        description={client.company ?? undefined}
        actions={
          <>
            <StatusBadge status={client.status} />
            {permissions.canEditClient && (
              <Button size="sm" variant="outline" onClick={() => setEditClientOpen(true)}>
                <Pencil className="h-4 w-4" /> Editar
              </Button>
            )}
            {permissions.canDeleteClient && (
              <ConfirmActionButton
                label={
                  <>
                    <Trash2 className="h-4 w-4" /> Excluir
                  </>
                }
                title="Excluir este cliente?"
                description="Isso remove o cliente permanentemente. Serviços contratados vinculados a ele também são removidos. Não pode ser desfeito."
                confirmLabel="Excluir"
                onConfirm={async () => {
                  const result = await deleteClientAction(client.id);
                  if (!result.error) router.push("/visionario/clientes");
                  return result;
                }}
              />
            )}
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <WhatsAppButton phone={client.whatsapp || client.phone} />
        {client.instagram && (
          <Button variant="outline" size="sm" asChild>
            <a href={client.instagram} target="_blank" rel="noopener noreferrer">
              <AtSign className="h-3.5 w-3.5" /> Instagram
            </a>
          </Button>
        )}
        {client.website && (
          <Button variant="outline" size="sm" asChild>
            <a href={client.website} target="_blank" rel="noopener noreferrer">
              <Globe className="h-3.5 w-3.5" /> Site
            </a>
          </Button>
        )}
        {client.email && (
          <Button variant="outline" size="sm" asChild>
            <a href={`mailto:${client.email}`}>
              <Mail className="h-3.5 w-3.5" /> E-mail
            </a>
          </Button>
        )}
      </div>

      <Tabs defaultValue="resumo">
        <TabsList className="flex-wrap">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="servicos">Serviços contratados</TabsTrigger>
          <TabsTrigger value="reunioes">Reuniões</TabsTrigger>
          <TabsTrigger value="observacoes">Observações</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Recorrência mensal</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{formatCurrency(monthlyValue)}</p>
              <p className="text-xs text-muted-foreground">{activeContracts.length} serviço(s) ativo(s)</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Cliente desde</p>
              <p className="mt-1 text-sm font-medium text-foreground">{formatDate(client.joined_at)}</p>
              {responsibleName && <p className="text-xs text-muted-foreground">Responsável: {responsibleName}</p>}
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Próxima reunião</p>
              {nextMeeting ? (
                <p className="mt-1 text-sm font-medium text-foreground">
                  {formatDate(nextMeeting.meeting_date)} às {nextMeeting.start_time.slice(0, 5)}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Nenhuma agendada</p>
              )}
            </Card>
          </div>
          <Card className="mt-3 p-4">
            <p className="mb-2 text-sm font-medium text-foreground">Contato</p>
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              {client.phone && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" /> {client.phone}
                </p>
              )}
              {client.email && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" /> {client.email}
                </p>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="servicos">
          {permissions.canCreateContract && (
            <div className="mb-2 flex flex-col items-end gap-1">
              <Button
                size="sm"
                disabled={activeServices.length === 0}
                onClick={() => {
                  setEditingContract(undefined);
                  setContractFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Contratar serviço
              </Button>
              {activeServices.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Cadastre um serviço ativo no catálogo (Serviços) antes.
                </p>
              )}
            </div>
          )}
          {contracts.length === 0 ? (
            <EmptyState title="Nenhum serviço contratado" />
          ) : (
            <div className="flex flex-col gap-2">
              {contracts.map((cs) => {
                const svc = serviceById.get(cs.service_id);
                return (
                  <div
                    key={cs.id}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{svc?.name ?? "Serviço"}</p>
                      <p className="text-xs text-muted-foreground">
                        {cs.billing_type === "recorrente"
                          ? `${FREQUENCY_LABEL[cs.frequency ?? "mensal"]} · vence dia ${cs.due_day}`
                          : "Pagamento único"}
                        {" · desde "}
                        {formatDate(cs.start_date)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={cs.status} />
                      <span className="text-sm font-medium">{formatCurrency(cs.price)}</span>
                      {permissions.canEditContract && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditingContract(cs);
                            setContractFormOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {permissions.canDeleteContract && (
                        <ConfirmActionButton
                          label={<Trash2 className="h-3.5 w-3.5" />}
                          title="Remover este serviço do cliente?"
                          description="O histórico financeiro (quando existir) não é afetado."
                          confirmLabel="Remover"
                          size="icon"
                          onConfirm={() => deleteClientServiceAction(cs.id, client.id)}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reunioes">
          {meetings.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Nenhuma reunião registrada com este cliente" />
          ) : (
            <div className="flex flex-col gap-2">
              {meetings.map((m) => (
                <Link
                  key={m.id}
                  href={`/visionario/reunioes/${m.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateLong(m.meeting_date)} às {m.start_time.slice(0, 5)}
                    </p>
                  </div>
                  <StatusBadge status={m.status} className="shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="observacoes">
          <Card className="p-4">
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {client.notes || "Nenhuma observação registrada."}
            </p>
          </Card>
        </TabsContent>
      </Tabs>

      {permissions.canEditClient && (
        <ClientFormDialog open={editClientOpen} onOpenChange={setEditClientOpen} client={client} members={members} />
      )}
      {(permissions.canCreateContract || permissions.canEditContract) && (
        <ContractServiceDialog
          open={contractFormOpen}
          onOpenChange={setContractFormOpen}
          clientId={client.id}
          services={activeServices}
          contract={editingContract}
        />
      )}
    </div>
  );
}
