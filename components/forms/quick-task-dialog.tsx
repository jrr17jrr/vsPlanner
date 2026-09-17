"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDbStore } from "@/store/db-store";
import { generateId } from "@/lib/ids";
import { toDateKey } from "@/lib/format";

const CATEGORY_OPTIONS = ["Pessoal", "Visionário Dev", "TikTok", "Estudos", "Faculdade", "Outros"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  userId: string;
  defaultDate?: string;
}

export function QuickTaskDialog({ open, onOpenChange, spaceId, userId, defaultDate }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <QuickTaskForm
          key="quick-task"
          onOpenChange={onOpenChange}
          spaceId={spaceId}
          userId={userId}
          defaultDate={defaultDate}
        />
      )}
    </Dialog>
  );
}

function QuickTaskForm({ onOpenChange, spaceId, userId, defaultDate }: Omit<Props, "open">) {
  const add = useDbStore((s) => s.add);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Pessoal");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Escreva o que você precisa fazer.");
      return;
    }
    add("tasks", {
      id: generateId("task"),
      spaceId,
      userId,
      title,
      category,
      priority: "media",
      dueDate: defaultDate ?? toDateKey(new Date()),
      status: "pendente",
      responsibleId: userId,
      createdAt: new Date().toISOString(),
    });
    toast.success("Tarefa adicionada ao seu dia.");
    setTitle("");
    onOpenChange(false);
  }

  return (
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>Tarefa rápida</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quick-title">O que você precisa fazer?</Label>
          <Input
            id="quick-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Ligar para o cliente"
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Categoria</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" className="mt-1">Adicionar</Button>
      </form>
    </DialogContent>
  );
}
