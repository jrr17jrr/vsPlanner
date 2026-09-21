"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmActionButton } from "@/components/shared/confirm-action-button";
import { formatCurrency } from "@/lib/format";
import { toDateKey } from "@/lib/format";
import {
  createFinancialAccountAction,
  updateFinancialAccountAction,
  deleteFinancialAccountAction,
  createFinancialCategoryAction,
  updateFinancialCategoryAction,
  deleteFinancialCategoryAction,
  createFinancialReferenceTypeAction,
  updateFinancialReferenceTypeAction,
  deleteFinancialReferenceTypeAction,
} from "@/lib/supabase/financial-actions";
import type { FinancialAccount, FinancialCategory, FinancialKind, FinancialReferenceType } from "@/types/database.types";
import type { FinancialScope } from "@/lib/space-slugs";

export function FinancialConfigManager({
  scope,
  accounts,
  categories,
  referenceTypes,
  accountBalances,
}: {
  scope: FinancialScope;
  accounts: FinancialAccount[];
  categories: FinancialCategory[];
  referenceTypes: FinancialReferenceType[];
  accountBalances: Map<string, number>;
}) {
  const [tab, setTab] = useState<"contas" | "categorias" | "referente">("contas");

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="contas">Contas</TabsTrigger>
          <TabsTrigger value="categorias">Categorias</TabsTrigger>
          <TabsTrigger value="referente">Referente a</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "contas" && <AccountsTab scope={scope} accounts={accounts} balances={accountBalances} />}
      {tab === "categorias" && <CategoriesTab scope={scope} categories={categories} />}
      {tab === "referente" && <ReferenceTypesTab scope={scope} referenceTypes={referenceTypes} />}
    </div>
  );
}

function AccountsTab({ scope, accounts, balances }: { scope: FinancialScope; accounts: FinancialAccount[]; balances: Map<string, number> }) {
  const [name, setName] = useState("");
  const [initialBalance, setInitialBalance] = useState("0");
  const [pending, setPending] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return toast.error("Dê um nome para a conta.");
    setPending(true);
    const result = await createFinancialAccountAction(scope, name, parseFloat(initialBalance.replace(",", ".")) || 0, toDateKey(new Date()));
    setPending(false);
    if (result.error) return toast.error(result.error);
    toast.success(result.success ?? "Conta criada.");
    setName("");
    setInitialBalance("0");
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input placeholder="Nome da conta (ex.: Nubank)" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
        </div>
        <div className="w-32">
          <Input placeholder="Saldo inicial" inputMode="decimal" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} disabled={pending} />
        </div>
        <Button size="sm" onClick={handleCreate} disabled={pending}><Plus className="h-4 w-4" /> Adicionar</Button>
      </Card>

      {accounts.length === 0 ? (
        <EmptyState title="Nenhuma conta cadastrada" />
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{a.name}</p>
                <p className="text-xs text-muted-foreground">Saldo: {formatCurrency(balances.get(a.id) ?? 0)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  checked={a.is_active}
                  onCheckedChange={(checked) => updateFinancialAccountAction(scope, a.id, a.name, checked).then((r) => r.error && toast.error(r.error))}
                />
                <ConfirmActionButton
                  label={<Trash2 className="h-3.5 w-3.5" />}
                  title="Excluir esta conta?"
                  description="Só funciona se não houver pagamentos nela — caso contrário, desative em vez de excluir."
                  confirmLabel="Excluir"
                  size="icon"
                  onConfirm={() => deleteFinancialAccountAction(scope, a.id)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoriesTab({ scope, categories }: { scope: FinancialScope; categories: FinancialCategory[] }) {
  const [kind, setKind] = useState<FinancialKind>("saida");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return toast.error("Dê um nome.");
    setPending(true);
    const result = await createFinancialCategoryAction(scope, kind, name);
    setPending(false);
    if (result.error) return toast.error(result.error);
    toast.success(result.success ?? "Criada.");
    setName("");
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:items-end">
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={kind === "entrada" ? "default" : "outline"} onClick={() => setKind("entrada")}>Entrada</Button>
          <Button type="button" size="sm" variant={kind === "saida" ? "default" : "outline"} onClick={() => setKind("saida")}>Saída</Button>
        </div>
        <div className="flex-1"><Input placeholder="Nome da categoria" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} /></div>
        <Button size="sm" onClick={handleCreate} disabled={pending}><Plus className="h-4 w-4" /> Adicionar</Button>
      </Card>

      {(["entrada", "saida"] as FinancialKind[]).map((k) => (
        <div key={k}>
          <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">{k === "entrada" ? "Entrada" : "Saída"}</p>
          <div className="flex flex-col gap-2">
            {categories.filter((c) => c.kind === k).length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma categoria.</p>
            ) : (
              categories.filter((c) => c.kind === k).map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-2.5">
                  <span className="text-sm text-foreground">{c.name}</span>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={c.is_active}
                      onCheckedChange={(checked) => updateFinancialCategoryAction(scope, c.id, c.name, checked).then((r) => r.error && toast.error(r.error))}
                    />
                    <ConfirmActionButton
                      label={<Trash2 className="h-3.5 w-3.5" />}
                      title="Excluir esta categoria?"
                      description="Só funciona se não estiver em uso — caso contrário, desative."
                      confirmLabel="Excluir"
                      size="icon"
                      onConfirm={() => deleteFinancialCategoryAction(scope, c.id)}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReferenceTypesTab({ scope, referenceTypes }: { scope: FinancialScope; referenceTypes: FinancialReferenceType[] }) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return toast.error("Dê um nome.");
    setPending(true);
    const result = await createFinancialReferenceTypeAction(scope, name);
    setPending(false);
    if (result.error) return toast.error(result.error);
    toast.success(result.success ?? "Criado.");
    setName("");
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:items-end">
        <div className="flex-1"><Input placeholder='Nome (ex.: "Manutenção")' value={name} onChange={(e) => setName(e.target.value)} disabled={pending} /></div>
        <Button size="sm" onClick={handleCreate} disabled={pending}><Plus className="h-4 w-4" /> Adicionar</Button>
      </Card>

      {referenceTypes.length === 0 ? (
        <EmptyState title='Nenhum "referente a" cadastrado' />
      ) : (
        <div className="flex flex-col gap-2">
          {referenceTypes.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-2.5">
              <span className="text-sm text-foreground">{r.name}</span>
              <div className="flex items-center gap-2">
                <Switch
                  checked={r.is_active}
                  onCheckedChange={(checked) => updateFinancialReferenceTypeAction(scope, r.id, r.name, checked).then((res) => res.error && toast.error(res.error))}
                />
                <ConfirmActionButton
                  label={<Trash2 className="h-3.5 w-3.5" />}
                  title='Excluir este "referente a"?'
                  description="Só funciona se não estiver em uso — caso contrário, desative."
                  confirmLabel="Excluir"
                  size="icon"
                  onConfirm={() => deleteFinancialReferenceTypeAction(scope, r.id)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
