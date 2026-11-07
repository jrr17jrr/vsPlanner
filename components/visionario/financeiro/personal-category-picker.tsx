"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPersonalExpenseCategoryAction, type PersonalCategoryOption } from "@/lib/supabase/financial-personal-link-actions";
import { PERSONAL_DEFAULT_CATEGORY } from "@/lib/finance/personal-link";

const DEFAULT = "__padrao__";
const NEW = "__nova__";

/**
 * Categoria da despesa no Financeiro PESSOAL: as já cadastradas + "Nova
 * categoria". `allowDefault` = opção "Padrão" (vazio → "Pagamentos da
 * Visionário Dev"), usada ao pagar/vincular pela Visionário Dev.
 */
export function PersonalCategoryPicker({
  categories,
  value,
  onChange,
  onCreated,
  disabled,
  allowDefault = true,
  label = "Categoria no Financeiro Pessoal",
}: {
  categories: PersonalCategoryOption[];
  value: string;
  onChange: (id: string) => void;
  onCreated: (c: PersonalCategoryOption) => void;
  disabled?: boolean;
  allowDefault?: boolean;
  label?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const options = allowDefault ? categories.filter((c) => c.name !== PERSONAL_DEFAULT_CATEGORY) : categories;

  async function create() {
    if (!name.trim()) return toast.error("Dê um nome para a categoria.");
    setSaving(true);
    const r = await createPersonalExpenseCategoryAction(name);
    setSaving(false);
    if (r.error || !r.category) return toast.error(r.error ?? "Não foi possível criar a categoria.");
    onCreated(r.category);
    onChange(r.category.id);
    setName("");
    setCreating(false);
    toast.success(`Categoria "${r.category.name}" pronta.`);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Select
        value={value || (allowDefault ? DEFAULT : "")}
        onValueChange={(v) => (v === NEW ? setCreating(true) : (setCreating(false), onChange(v === DEFAULT ? "" : v)))}
        disabled={disabled || saving}
      >
        <SelectTrigger aria-label={label}><SelectValue placeholder="Escolha a categoria" /></SelectTrigger>
        <SelectContent>
          {allowDefault && <SelectItem value={DEFAULT}>{PERSONAL_DEFAULT_CATEGORY} (padrão)</SelectItem>}
          {options.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          <SelectItem value={NEW}>+ Nova categoria…</SelectItem>
        </SelectContent>
      </Select>
      {creating && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void create();
              }
            }}
            placeholder="Ex.: Ferramentas de trabalho"
            maxLength={80}
            aria-label="Nome da nova categoria"
            disabled={saving}
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" className="h-9 gap-1" onClick={create} disabled={saving}><Plus className="h-3.5 w-3.5" />{saving ? "Criando…" : "Criar"}</Button>
            <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setCreating(false)} disabled={saving}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
