"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Briefcase } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ChecklistItem, PriorityBadge } from "@/components/shared/checklist-item";
import { WorkTaskFormDialog } from "@/components/trabalho/work-task-form-dialog";
import {
  togglePersonalWorkTaskStatusAction,
  moveWorkTaskDateAction,
  deletePersonalWorkTaskAction,
} from "@/lib/supabase/personal-actions";
import { classifyDueDate } from "@/lib/due-date";
import { formatDate, todayKeySaoPaulo } from "@/lib/format";
import type { PersonalWorkTask } from "@/types/database.types";

export function TrabalhoPageClient({ tasks }: { tasks: PersonalWorkTask[] }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PersonalWorkTask | undefined>();
  const [deleting, setDeleting] = useState<PersonalWorkTask | undefined>();
  const [tab, setTab] = useState("hoje");

  const today = todayKeySaoPaulo();

  const groups = useMemo(() => {
    const bucket = (t: PersonalWorkTask) => classifyDueDate(t.due_date, t.status === "concluida", today);
    const atrasadas = tasks.filter((t) => bucket(t) === "atrasado");
    const hoje = tasks.filter((t) => bucket(t) === "vence_hoje");
    const semData = tasks.filter((t) => bucket(t) === "sem_prazo");
    const proximas = tasks.filter((t) => bucket(t) === "proximo");
    const concluidas = tasks
      .filter((t) => t.status === "concluida")
      .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
    return { atrasadas, hoje: [...hoje, ...semData], proximas, concluidas };
  }, [tasks, today]);

  async function toggle(task: PersonalWorkTask) {
    const next = task.status === "concluida" ? "pendente" : "concluida";
    const result = await togglePersonalWorkTaskStatusAction(task.id, next);
    if (result.error) toast.error(result.error);
  }

  async function handleDelete() {
    if (!deleting) return;
    const result = await deletePersonalWorkTaskAction(deleting.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setDeleting(undefined);
  }

  function renderList(items: PersonalWorkTask[], empty: string) {
    if (items.length === 0) return <EmptyState title={empty} className="py-8" />;
    return (
      <div className="flex flex-col gap-2">
        {items
          .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
          .map((t) => (
            <ChecklistItem
              key={t.id}
              title={t.title}
              done={t.status === "concluida"}
              time={t.scheduled_time?.slice(0, 5)}
              onToggle={() => toggle(t)}
              onEdit={() => { setEditing(t); setFormOpen(true); }}
              onDelete={() => setDeleting(t)}
              onMove={(d) => moveWorkTaskDateAction(t.id, d).then((r) => r.error && toast.error(r.error))}
              badges={
                <>
                  <PriorityBadge priority={t.priority} />
                  {t.due_date && <span className="text-[11px] text-muted-foreground">{formatDate(t.due_date)}</span>}
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
          {tasks.length === 0 ? (
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

      <WorkTaskFormDialog open={formOpen} onOpenChange={setFormOpen} task={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="Excluir tarefa?"
        description={`"${deleting?.title}" será removida permanentemente.`}
        onConfirm={handleDelete}
      />
    </div>
  );
}
