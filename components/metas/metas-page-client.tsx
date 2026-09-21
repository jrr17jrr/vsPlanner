"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Target, CheckCircle2, Pencil, Trash2, Minus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { GoalFormDialog } from "@/components/metas/goal-form-dialog";
import { adjustGoalValueAction, deleteGoalAction } from "@/lib/supabase/personal-actions";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Goal } from "@/types/database.types";

function AdjustValuePopover({ goal, mode, children }: { goal: Goal; mode: "add" | "remove"; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);

  async function apply() {
    const v = Number(value.replace(",", "."));
    if (!v || v <= 0) return;
    setPending(true);
    const result = await adjustGoalValueAction(goal.id, mode === "add" ? v : -v);
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(mode === "add" ? "Valor adicionado à meta." : "Valor removido da meta.");
    setValue("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-56">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{mode === "add" ? "Adicionar valor" : "Remover valor"}</p>
        <div className="flex gap-2">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            disabled={pending}
            autoFocus
          />
          <Button size="sm" onClick={apply} disabled={pending}>OK</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function MetasPageClient({ goals }: { goals: Goal[] }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | undefined>();
  const [deleting, setDeleting] = useState<Goal | undefined>();

  async function handleDelete() {
    if (!deleting) return;
    const result = await deleteGoalAction(deleting.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setDeleting(undefined);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Metas"
        description="Acompanhe seus objetivos — pessoais, sem contaminar o Financeiro."
        actions={
          <Button size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Nova meta
          </Button>
        }
      />

      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhuma meta cadastrada"
          description="Crie uma meta para começar a acompanhar seu progresso."
          action={
            <Button size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
              <Plus className="h-4 w-4" /> Nova meta
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => {
            const hasTarget = goal.target_value !== null && goal.target_value > 0;
            const pct = hasTarget ? Math.min(100, Math.round((goal.current_value / goal.target_value!) * 100)) : null;
            const done = goal.status === "concluida";
            return (
              <Card key={goal.id} className={cn("p-4", done && "border-success/40")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{goal.title}</p>
                    {goal.target_date && <p className="text-xs text-muted-foreground">até {formatDate(goal.target_date)}</p>}
                  </div>
                  {done && (
                    <span className="flex items-center gap-1 text-xs font-medium text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Concluída
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-baseline justify-between text-xs">
                  <span className="font-medium tabular-nums text-foreground">{formatCurrency(goal.current_value)}</span>
                  {hasTarget && <span className="tabular-nums text-muted-foreground">{formatCurrency(goal.target_value!)}</span>}
                </div>
                {pct !== null && (
                  <>
                    <Progress value={pct} className="mt-1.5" />
                    <p className="mt-1 text-right text-xs font-medium text-primary">{pct}%</p>
                  </>
                )}

                <div className="mt-3 flex items-center gap-1.5">
                  <AdjustValuePopover goal={goal} mode="add">
                    <Button size="sm" variant="outline" className="flex-1"><Plus className="h-3.5 w-3.5" /> Adicionar</Button>
                  </AdjustValuePopover>
                  <AdjustValuePopover goal={goal} mode="remove">
                    <Button size="sm" variant="outline" className="flex-1"><Minus className="h-3.5 w-3.5" /> Remover</Button>
                  </AdjustValuePopover>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => { setEditing(goal); setFormOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setDeleting(goal)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <GoalFormDialog open={formOpen} onOpenChange={setFormOpen} goal={editing} />
      <ConfirmDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(undefined)} title="Excluir meta?" onConfirm={handleDelete} />
    </div>
  );
}
