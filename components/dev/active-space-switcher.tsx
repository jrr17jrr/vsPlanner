"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { setActiveSpaceAction } from "@/lib/supabase/space-actions";
import type { Space } from "@/types/database.types";

/**
 * Prévia do "espaço ativo real" (cookie `vsplanner_active_space`,
 * validado contra `space_members`/`spaces` de verdade). Infraestrutura
 * para a próxima fase — nenhum módulo (rotina/tarefas/financeiro/...) lê
 * isso ainda, então trocar aqui não muda nada visível fora deste widget.
 */
export function ActiveSpaceSwitcher({
  mySpaces,
  active,
}: {
  mySpaces: Space[];
  active: Space;
}) {
  const [pending, startTransition] = useTransition();

  function handleChange(spaceId: string) {
    startTransition(async () => {
      const result = await setActiveSpaceAction(spaceId);
      if (result.error) toast.error(result.error);
    });
  }

  if (mySpaces.length <= 1) return null;

  return (
    <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-foreground">Seu espaço ativo (prévia)</p>
        <p className="text-xs text-muted-foreground">
          Infraestrutura da próxima fase — ainda não conectada aos módulos.
        </p>
      </div>
      <Select value={active.id} onValueChange={handleChange} disabled={pending}>
        <SelectTrigger className="sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {mySpaces.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Card>
  );
}
