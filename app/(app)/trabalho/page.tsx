"use client";

import { useMemo, useState } from "react";
import { Plus, Briefcase } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ChecklistItem, PriorityBadge } from "@/components/shared/checklist-item";
import { WorkTaskFormDialog } from "@/components/forms/work-task-form-dialog";
import { classifyByDate } from "@/lib/day-planner";
import { formatDate, toDateKey } from "@/lib/format";
import type { WorkTask } from "@/types/entities";

export default function TrabalhoPage() {
  const { profile, personalSpace } = useAuth();
  const workTasks = useDbStore((s) => s.workTasks);
  const update = useDbStore((s) => s.update);
  const remove = useDbStore((s) => s.remove);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkTask | undefined>();
  const [deleting, setDeleting] = useState<WorkTask | undefined>();
  const [tab, setTab] = useState("hoje");

  const today = toDateKey(new Date());

  const mine = useMemo(
    () => workTasks.filter((t) => t.userId === profile?.id),
    [workTasks, profile?.id]
  );

  const groups = useMemo(() => {
    const atrasadas = mine.filter((t) => classifyByDate(t.dueDate, t.status, today) === "atrasada");
    const hoje = mine.filter((t) => classifyByDate(t.dueDate, t.status, today) === "hoje" && t.status !== "concluida");
    const proximas = mine.filter((t) => classifyByDate(t.dueDate, t.status, today) === "proxima" && t.status !== "concluida");
    const semData = mine.filter((t) => !t.dueDate && t.status !== "concluida");
    const concluidas = mine
      .filter((t) => t.status === "concluida")
      .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    return { atrasadas, hoje: [...hoje, ...semData], proximas, concluidas };
  }, [mine, today]);

  function toggle(task: WorkTask) {
    const done = task.status === "concluida";
    update("workTasks", task.id, {
      status: done ? "pendente" : "concluida",
      completedAt: done ? undefined : new Date().toISOString(),
    });
  }

  function move(task: WorkTask, newDate: string) {
    update("workTasks", task.id, { dueDate: newDate });
  }

  if (!profile || !personalSpace) return null;

  function renderList(items: WorkTask[], empty: string) {
    if (items.length === 0) return <EmptyState title={empty} className="py-8" />;
    return (
      <div className="flex flex-col gap-2">
        {items
          .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
          .map((t) => (
            <ChecklistItem
              key={t.id}
              title={t.title}
              done={t.status === "concluida"}
              time={t.scheduledTime}
              onToggle={() => toggle(t)}
              onEdit={() => { setEditing(t); setFormOpen(true); }}
              onDelete={() => setDeleting(t)}
              onMove={(d) => move(t, d)}
              badges={
                <>
                  <PriorityBadge priority={t.priority} />
                  {t.dueDate && <span className="text-[11px] text-muted-foreground">{formatDate(t.dueDate)}</span>}
                </>
              }
            />
          ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Trabalho / CLT"
        description="Organização do seu emprego — separado da Visionário Dev."
        actions={
          <Button size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Nova tarefa
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="hoje">Hoje ({groups.hoje.length})</TabsTrigger>
          <TabsTrigger value="atrasadas">Atrasadas ({groups.atrasadas.length})</TabsTrigger>
          <TabsTrigger value="proximas">Próximas ({groups.proximas.length})</TabsTrigger>
          <TabsTrigger value="concluidas">Concluídas ({groups.concluidas.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="hoje">
          {mine.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="Nenhuma tarefa de trabalho cadastrada"
              description="Adicione o que você precisa fazer no seu emprego hoje."
              action={
                <Button size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
                  <Plus className="h-4 w-4" /> Nova tarefa
                </Button>
              }
            />
          ) : (
            renderList(groups.hoje, "Nenhuma tarefa para hoje.")
          )}
        </TabsContent>
        <TabsContent value="atrasadas">{renderList(groups.atrasadas, "Nenhuma tarefa atrasada.")}</TabsContent>
        <TabsContent value="proximas">{renderList(groups.proximas, "Nenhuma tarefa futura.")}</TabsContent>
        <TabsContent value="concluidas">{renderList(groups.concluidas, "Nenhuma tarefa concluída ainda.")}</TabsContent>
      </Tabs>

      <WorkTaskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        workTask={editing}
        spaceId={personalSpace.id}
        userId={profile.id}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="Excluir tarefa?"
        description={`"${deleting?.title}" será removida permanentemente.`}
        onConfirm={() => deleting && remove("workTasks", deleting.id)}
      />
    </div>
  );
}
