"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MODULE_PERMISSION_GROUPS,
  MODULE_PERMISSION_ACTION_LABELS,
  defaultModulePermission,
} from "@/lib/module-permissions";
import { setModulePermissionAction } from "@/lib/supabase/module-permissions-actions";
import type {
  ModulePermissionAction,
  ModulePermissionModule,
  SpaceModulePermission,
  SpaceRole,
} from "@/types/database.types";

/**
 * Checkboxes de permissão por módulo pra UMA membership (hoje: só usado
 * pro Visionário Dev). Cada checkbox já nasce marcado/desmarcado conforme
 * o padrão da role (`defaultModulePermission`, espelho em JS de
 * `default_module_permission()`) e grava um override explícito assim que
 * alterado — sem estado "herdar da role" na UI, simples binário como no
 * exemplo pedido.
 */
export function VisionarioPermissionsPanel({
  spaceMemberId,
  role,
  overrides,
  userId,
}: {
  spaceMemberId: string;
  role: SpaceRole;
  overrides: SpaceModulePermission[];
  userId: string;
}) {
  const overrideMap = new Map(overrides.map((o) => [`${o.module}:${o.action}`, o.allowed]));

  const [state, setState] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of MODULE_PERMISSION_GROUPS) {
      for (const action of group.actions) {
        const key = `${group.key}:${action}`;
        initial[key] = overrideMap.get(key) ?? defaultModulePermission(role, group.key, action);
      }
    }
    return initial;
  });
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(moduleKey: ModulePermissionModule, action: ModulePermissionAction) {
    const key = `${moduleKey}:${action}`;
    const next = !state[key];
    setState((prev) => ({ ...prev, [key]: next }));
    setPendingKey(key);
    startTransition(async () => {
      const result = await setModulePermissionAction(spaceMemberId, userId, moduleKey, action, next);
      if (result.error) {
        toast.error(result.error);
        setState((prev) => ({ ...prev, [key]: !next }));
      }
      setPendingKey(null);
    });
  }

  return (
    <Card className="p-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Visionário Dev — Permissões
      </p>
      <p className="mb-4 text-xs text-muted-foreground">
        Role no espaço: <span className="font-medium text-foreground">{role}</span>. Os checkboxes já
        vêm marcados conforme o padrão da role — mude só onde quiser uma exceção.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {MODULE_PERMISSION_GROUPS.map((group) => (
          <div key={group.key} className="rounded-lg border border-border p-3">
            <p className="mb-2 text-sm font-medium text-foreground">{group.label}</p>
            <div className="flex flex-col gap-1.5">
              {group.actions.map((action) => {
                const key = `${group.key}:${action}`;
                return (
                  <label key={key} className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox
                      checked={state[key]}
                      onCheckedChange={() => toggle(group.key, action)}
                      disabled={pendingKey === key}
                    />
                    {MODULE_PERMISSION_ACTION_LABELS[action]}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
