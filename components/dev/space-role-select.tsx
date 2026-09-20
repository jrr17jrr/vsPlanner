"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { SpaceRole } from "@/types/database.types";

const ROLE_LABELS: Record<SpaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

const ROLES: SpaceRole[] = ["owner", "admin", "member", "viewer"];

export function SpaceRoleSelect({
  value,
  disabled,
  onChange,
}: {
  value: SpaceRole;
  disabled?: boolean;
  onChange: (role: SpaceRole) => Promise<{ error?: string; success?: string } | void>;
}) {
  const [pending, startTransition] = useTransition();

  function handleChange(next: string) {
    startTransition(async () => {
      const result = await onChange(next as SpaceRole);
      if (result && "error" in result && result.error) toast.error(result.error);
      else if (result && "success" in result && result.success) toast.success(result.success);
    });
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={disabled || pending}>
      <SelectTrigger className="h-8 w-28 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((role) => (
          <SelectItem key={role} value={role}>
            {ROLE_LABELS[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
