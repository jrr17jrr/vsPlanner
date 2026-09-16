"use client";

import { useState } from "react";
import { Plus, Target, CheckCircle2, Pencil, Trash2, Minus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { GoalFormDialog } from "@/components/forms/goal-form-dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FinancialGoal } from "@/types/entities";

function AdjustValuePopover({
  goal,
  mode,
  children,
}: {
  goal: FinancialGoal;
  mode: "add" | "remove";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const update = useDbStore((s) => s.update);

  function apply() {
    const v = Number(value.replace(",", "."));
    if (!v || v <= 0) return;
    const delta = mode === "add" ? v : -v;
    const next = Math.max(0, goal.currentAmount + delta);
    update("financialGoals", goal.id, {
      currentAmount: next,
      status: next >= goal.targetAmount ? "concluida" : "em_andamento",
    });
    toast.success(mode === "add" ? "Valor adicionado à meta." : "Valor removido da meta.");
    setValue("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-56">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {mode === "add" ? "Adicionar valor" : "Remover valor"}
        </p>
        <div className="flex gap-2">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            autoFocus
          />
          <Button size="sm" onClick={apply}>OK</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function MetasPage() {
  const { personalSpace } = useAuth();
  const goals = useDbStore((s) => s.financialGoals);
  const remove = useDbStore((s) => s.remove);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FinancialGoal | undefined>();
  const [deleting, setDeleting] = useState<FinancialGoal | undefined>();

  if (!personalSpace) return null;

  const myGoals = goals.filter((g) => g.spaceId === personalSpace.id);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Metas"
        description="Acompanhe seus objetivos financeiros."
        actions={
          <Button size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Nova meta
          </Button>
        }
      />

      {myGoals.length === 0 ? (
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
          {myGoals.map((goal) => {
            const pct = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0;
            const done = goal.status === "concluida";
            return (
              <Card key={goal.id} className={cn("p-4", done && "border-success/40")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{goal.title}</p>
                    {goal.deadline && (
                      <p className="text-xs text-muted-foreground">até {formatDate(goal.deadline)}</p>
                    )}
                  </div>
                  {done && (
                    <span className="flex items-center gap-1 text-xs font-medium text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Concluída
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-baseline justify-between text-xs">
                  <span className="font-medium tabular-nums text-foreground">
                    {formatCurrency(goal.currentAmount)}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatCurrency(goal.targetAmount)}
                  </span>
                </div>
                <Progress value={pct} className="mt-1.5" />
                <p className="mt-1 text-right text-xs font-medium text-primary">{pct}%</p>

                <div className="mt-3 flex items-center gap-1.5">
                  <AdjustValuePopover goal={goal} mode="add">
                    <Button size="sm" variant="outline" className="flex-1">
                      <Plus className="h-3.5 w-3.5" /> Adicionar
                    </Button>
                  </AdjustValuePopover>
                  <AdjustValuePopover goal={goal} mode="remove">
                    <Button size="sm" variant="outline" className="flex-1">
                      <Minus className="h-3.5 w-3.5" /> Remover
                    </Button>
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

      <GoalFormDialog open={formOpen} onOpenChange={setFormOpen} goal={editing} spaceId={personalSpace.id} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="Excluir meta?"
        onConfirm={() => deleting && remove("financialGoals", deleting.id)}
      />
    </div>
  );
}
