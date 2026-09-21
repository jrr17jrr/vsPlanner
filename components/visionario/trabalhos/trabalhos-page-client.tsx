"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Briefcase, Pencil, Trash2, AlertTriangle, User, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmActionButton } from "@/components/shared/confirm-action-button";
import { WorkItemFormDialog } from "@/components/visionario/trabalhos/work-item-form-dialog";
import { deleteWorkItemAction, updateWorkItemStatusAction } from "@/lib/supabase/work-items-actions";
import { formatDate } from "@/lib/format";
import { daysUntil } from "@/lib/due-date";
import type {
  Client,
  Service,
  SpaceMemberProfile,
  WorkItem,
  WorkItemAssignee,
  WorkItemStatus,
} from "@/types/database.types";

type ResponsibleFilter = "todos" | "meus" | "outros" | "sem_responsavel";

const STATUS_TABS: Array<{ value: "todos" | WorkItemStatus; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "pendente", label: "Pendente" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "aguardando_cliente", label: "Aguardando cliente" },
  { value: "concluido", label: "Concluído" },
];

export function TrabalhosPageClient({
  workItems,
  assignees,
  members,
  clients,
  services,
  currentUserId,
  permissions,
}: {
  workItems: WorkItem[];
  assignees: WorkItemAssignee[];
  members: SpaceMemberProfile[];
  clients: Client[];
  services: Service[];
  currentUserId: string;
  permissions: { canCreate: boolean; canEdit: boolean; canDelete: boolean; canConclude: boolean };
}) {
  const [statusFilter, setStatusFilter] = useState<"todos" | WorkItemStatus>("todos");
  const [responsibleFilter, setResponsibleFilter] = useState<ResponsibleFilter>("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkItem | undefined>();

  const nameById = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

  const assigneesByWorkItem = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of assignees) {
      const list = map.get(a.work_item_id) ?? [];
      list.push(a.user_id);
      map.set(a.work_item_id, list);
    }
    return map;
  }, [assignees]);

  const items = useMemo(
    () =>
      workItems
        .filter((w) => statusFilter === "todos" || w.status === statusFilter)
        .filter((w) => {
          const assigneeIds = assigneesByWorkItem.get(w.id) ?? [];
          switch (responsibleFilter) {
            case "meus":
              return assigneeIds.includes(currentUserId);
            case "outros":
              return assigneeIds.length > 0 && !assigneeIds.includes(currentUserId);
            case "sem_responsavel":
              return assigneeIds.length === 0;
            default:
              return true;
          }
        })
        .sort((a, b) => (a.due_date ?? "9999-99-99").localeCompare(b.due_date ?? "9999-99-99")),
    [workItems, statusFilter, responsibleFilter, assigneesByWorkItem, currentUserId]
  );

  async function handleStatusChange(workItem: WorkItem, status: WorkItemStatus) {
    const result = await updateWorkItemStatusAction(workItem.id, status);
    if (result.error) toast.error(result.error);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Trabalhos"
        description="Demandas em andamento na Visionário Dev."
        actions={
          permissions.canCreate ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(undefined);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Novo trabalho
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <TabsList className="flex-wrap">
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Select value={responsibleFilter} onValueChange={(v) => setResponsibleFilter(v as ResponsibleFilter)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os responsáveis</SelectItem>
            <SelectItem value="meus">Meus trabalhos</SelectItem>
            <SelectItem value="outros">De outros</SelectItem>
            <SelectItem value="sem_responsavel">Sem responsável</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Nenhum trabalho encontrado"
          action={
            permissions.canCreate ? (
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" /> Novo trabalho
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((w) => {
            const client = w.client_id ? clientById.get(w.client_id) : undefined;
            const service = w.service_id ? serviceById.get(w.service_id) : undefined;
            const assigneeIds = assigneesByWorkItem.get(w.id) ?? [];
            const responsibleNames = assigneeIds
              .map((id) => nameById.get(id))
              .filter((n): n is string => !!n);
            const days = daysUntil(w.due_date ?? undefined);
            const isMine = assigneeIds.includes(currentUserId);

            return (
              <Card key={w.id} className="p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{w.title}</p>
                      {days !== null && days < 0 && w.status !== "concluido" && (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                      )}
                    </div>
                    {w.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{w.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {client && <span>Cliente: {client.name}</span>}
                      {service && <span>Serviço: {service.name}</span>}
                      {w.due_date && <span>Prazo: {formatDate(w.due_date)}</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {responsibleNames.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Sem responsável</span>
                      ) : (
                        responsibleNames.map((name) => (
                          <span key={name} className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            {name}
                          </span>
                        ))
                      )}
                      {isMine && <span className="text-[11px] text-primary">(você)</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={w.status} />
                    <StatusBadge status={w.priority} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                  {permissions.canConclude && w.status !== "concluido" && (
                    <Button variant="outline" size="sm" onClick={() => handleStatusChange(w, "concluido")}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Concluir
                    </Button>
                  )}
                  {permissions.canEdit && w.status === "pendente" && (
                    <Button variant="ghost" size="sm" onClick={() => handleStatusChange(w, "em_andamento")}>
                      Iniciar
                    </Button>
                  )}
                  {permissions.canEdit && w.status === "em_andamento" && (
                    <Button variant="ghost" size="sm" onClick={() => handleStatusChange(w, "aguardando_cliente")}>
                      Aguardando cliente
                    </Button>
                  )}
                  {permissions.canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(w);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                  )}
                  {permissions.canDelete && (
                    <ConfirmActionButton
                      label={
                        <>
                          <Trash2 className="h-3.5 w-3.5" /> Excluir
                        </>
                      }
                      title="Excluir este trabalho?"
                      description="Isso remove o trabalho e a lista de responsáveis permanentemente. Não pode ser desfeito."
                      confirmLabel="Excluir"
                      variant="ghost"
                      size="sm"
                      onConfirm={() => deleteWorkItemAction(w.id)}
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {(permissions.canCreate || permissions.canEdit) && (
        <WorkItemFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          workItem={editing}
          currentAssigneeIds={editing ? assigneesByWorkItem.get(editing.id) ?? [] : []}
          members={members}
          clients={clients}
          services={services}
        />
      )}
    </div>
  );
}
