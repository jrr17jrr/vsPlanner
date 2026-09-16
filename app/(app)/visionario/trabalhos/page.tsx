"use client";

import { useMemo, useState } from "react";
import { Plus, Briefcase, Pencil, Trash2, CalendarPlus, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { WorkItemFormDialog } from "@/components/forms/work-item-form-dialog";
import { AddToRoutineDialog } from "@/components/forms/add-to-routine-dialog";
import { formatDate } from "@/lib/format";
import { daysUntil } from "@/lib/selectors";
import type { WorkItem, WorkStatus } from "@/types/entities";

export default function TrabalhosPage() {
  const { profile, personalSpace, mySpaces } = useAuth();
  const workItems = useDbStore((s) => s.workItems);
  const clients = useDbStore((s) => s.clients);
  const services = useDbStore((s) => s.services);
  const profiles = useDbStore((s) => s.profiles);
  const spaceMembers = useDbStore((s) => s.spaceMembers);
  const remove = useDbStore((s) => s.remove);

  const [statusFilter, setStatusFilter] = useState<"todos" | WorkStatus>("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkItem | undefined>();
  const [deleting, setDeleting] = useState<WorkItem | undefined>();
  const [routineTarget, setRoutineTarget] = useState<WorkItem | undefined>();

  const visionarioSpace = mySpaces.find((s) => s.slug === "visionario-dev");

  const members = useMemo(
    () =>
      visionarioSpace
        ? spaceMembers
            .filter((m) => m.spaceId === visionarioSpace.id)
            .map((m) => profiles.find((p) => p.id === m.userId))
            .filter((p): p is NonNullable<typeof p> => !!p)
            .map((p) => ({ id: p.id, name: p.name }))
        : [],
    [visionarioSpace, spaceMembers, profiles]
  );

  if (!visionarioSpace || !profile || !personalSpace) return null;

  const items = workItems
    .filter((w) => w.spaceId === visionarioSpace.id)
    .filter((w) => statusFilter === "todos" || w.status === statusFilter)
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Trabalhos"
        description="Demandas em andamento na Visionário Dev."
        actions={
          <Button size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Novo trabalho
          </Button>
        }
      />

      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
        <TabsList>
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="pendente">Pendente</TabsTrigger>
          <TabsTrigger value="em_andamento">Em andamento</TabsTrigger>
          <TabsTrigger value="aguardando_cliente">Aguardando cliente</TabsTrigger>
          <TabsTrigger value="concluido">Concluído</TabsTrigger>
        </TabsList>
      </Tabs>

      {items.length === 0 ? (
        <EmptyState icon={Briefcase} title="Nenhum trabalho encontrado" />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((w) => {
            const client = clients.find((c) => c.id === w.clientId);
            const service = services.find((s) => s.id === w.serviceId);
            const responsibles = w.responsibleIds
              .map((id) => profiles.find((p) => p.id === id)?.name)
              .filter(Boolean)
              .join(", ");
            const days = daysUntil(w.dueDate);
            const isMine = w.responsibleIds.includes(profile.id);
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
                      {responsibles && <span>Responsável: {responsibles}</span>}
                      {w.dueDate && <span>Prazo: {formatDate(w.dueDate)}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={w.status} />
                    <StatusBadge status={w.priority} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                  {isMine && w.status !== "concluido" && (
                    <Button variant="outline" size="sm" onClick={() => setRoutineTarget(w)}>
                      <CalendarPlus className="h-3.5 w-3.5" /> Adicionar à minha rotina
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(w); setFormOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(w)}>
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <WorkItemFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        workItem={editing}
        spaceId={visionarioSpace.id}
        clients={clients.filter((c) => c.spaceId === visionarioSpace.id)}
        services={services.filter((s) => s.spaceId === visionarioSpace.id)}
        members={members}
      />
      <AddToRoutineDialog
        open={!!routineTarget}
        onOpenChange={(open) => !open && setRoutineTarget(undefined)}
        workItem={routineTarget}
        spaceId={personalSpace.id}
        userId={profile.id}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="Excluir trabalho?"
        onConfirm={() => deleting && remove("workItems", deleting.id)}
      />
    </div>
  );
}
