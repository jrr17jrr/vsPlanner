"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSpaceAction } from "@/lib/supabase/admin-spaces-actions";
import type { SpaceType } from "@/types/database.types";

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function CreateSpaceDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [type, setType] = useState<SpaceType>("business");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resetForm() {
    setName("");
    setSlug("");
    setSlugTouched(false);
    setType("business");
    setError(null);
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createSpaceAction({ name, slug, type });
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(result.success ?? "Espaço criado.");
      resetForm();
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" /> Novo espaço
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo espaço</DialogTitle>
          <DialogDescription>
            Você vira o dono (owner) deste espaço. Depois é só conceder acesso a outros usuários
            pela tela do espaço.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-space-name">Nome</Label>
            <Input
              id="new-space-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              disabled={pending}
              placeholder="Visionário Dev"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-space-slug">Slug</Label>
            <Input
              id="new-space-slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              disabled={pending}
              placeholder="visionario-dev"
            />
            <p className="text-xs text-muted-foreground">
              Identificador usado pelo código (ex: para achar o Visionário Dev) — minúsculo, sem
              espaço.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as SpaceType)} disabled={pending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="business">business</SelectItem>
                <SelectItem value="personal">personal</SelectItem>
                <SelectItem value="other">other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={pending || !name.trim() || !slug.trim()}>
            {pending ? "Criando…" : "Criar espaço"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
