"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { SpaceRole } from "@/types/database.types";

const ROLE_OPTIONS: { value: SpaceRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
];

export function GrantAccessForm({
  options,
  optionLabel,
  onSubmit,
}: {
  options: { value: string; label: string }[];
  optionLabel: string;
  onSubmit: (selectedId: string, role: SpaceRole) => Promise<{ error?: string; success?: string } | void>;
}) {
  const [selectedId, setSelectedId] = useState(options[0]?.value ?? "");
  const [role, setRole] = useState<SpaceRole>("member");
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    if (!selectedId) return;
    startTransition(async () => {
      const result = await onSubmit(selectedId, role);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success((result && "success" in result && result.success) || "Acesso concedido.");
    });
  }

  if (options.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select value={selectedId} onValueChange={setSelectedId} disabled={pending}>
        <SelectTrigger className="sm:flex-1">
          <SelectValue placeholder={optionLabel} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={role} onValueChange={(v) => setRole(v as SpaceRole)} disabled={pending}>
        <SelectTrigger className="sm:w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={handleSubmit} disabled={pending || !selectedId}>
        {pending ? "Concedendo…" : "Conceder"}
      </Button>
    </div>
  );
}
