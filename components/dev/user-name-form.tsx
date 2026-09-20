"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateUserNameAction } from "@/lib/supabase/admin-users-actions";

export function UserNameForm({ userId, initialName }: { userId: string; initialName: string }) {
  const [name, setName] = useState(initialName);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateUserNameAction(userId, name);
      if (result.error) toast.error(result.error);
      else toast.success(result.success ?? "Nome atualizado.");
    });
  }

  const dirty = name.trim() !== initialName.trim() && name.trim().length > 0;

  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor={`name-${userId}`}>Nome</Label>
        <Input
          id={`name-${userId}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
        />
      </div>
      <Button size="sm" onClick={handleSave} disabled={pending || !dirty}>
        {pending ? "Salvando…" : "Salvar"}
      </Button>
    </div>
  );
}
