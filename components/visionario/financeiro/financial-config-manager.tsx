"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmActionButton } from "@/components/shared/confirm-action-button";
import { formatCurrency, formatDate, parseMoneyInput, todayKeySaoPaulo } from "@/lib/format";
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

type ConfigPermissions = { canCreate: boolean; canEdit: boolean; canDelete: boolean };

export function FinancialConfigManager({
  scope,
  accounts,
  categories,
  referenceTypes,
  accountBalances,
  permissions,
}: {
  scope: FinancialScope;
  accounts: FinancialAccount[];
  categories: FinancialCategory[];
  referenceTypes: FinancialReferenceType[];
  accountBalances: Map<string, number>;
  permissions: ConfigPermissions;
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

      {tab === "contas" && <AccountsTab scope={scope} accounts={accounts} balances={accountBalances} permissions={permissions} />}
      {tab === "categorias" && <CategoriesTab scope={scope} categories={categories} permissions={permissions} />}
      {tab === "referente" && <ReferenceTypesTab scope={scope} referenceTypes={referenceTypes} permissions={permissions} />}
    </div>
  );
}

function AccountsTab({
  scope,
  accounts,
  balances,
  permissions,
}: {
  scope: FinancialScope;
  accounts: FinancialAccount[];
  balances: Map<string, number>;
  permissions: ConfigPermissions;
}) {
  const [name, setName] = useState("");
  const [initialBalance, setInitialBalance] = useState("0,00");
  const [initialDate, setInitialDate] = useState(todayKeySaoPaulo());
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<FinancialAccount | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Dê um nome para a conta.");
    const balance = parseMoneyInput(initialBalance || "0");
    if (!Number.isFinite(balance)) return toast.error("Saldo inicial inválido.");
    setPending(true);
    const result = await createFinancialAccountAction(scope, name, balance, initialDate);
    setPending(false);
    if (result.error) return toast.error(result.error);
    toast.success(result.success ?? "Conta criada.");
    setName("");
    setInitialBalance("0,00");
  }

  async function toggle(account: FinancialAccount, checked: boolean) {
    const result = await updateFinancialAccountAction(scope, account.id, { isActive: checked });
    if (result.error) toast.error(result.error);
    else toast.success(result.success ?? "Conta atualizada.");
  }

  return (
    <div className="flex flex-col gap-3">
      {permissions.canCreate && (
        <Card className="p-3">
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_9rem_10rem_auto] sm:items-end">
            <div className="flex flex-col gap-1">
              <Label htmlFor="acc-name" className="text-xs">Nome da conta</Label>
              <Input id="acc-name" placeholder="Ex.: banco, carteira…" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="acc-balance" className="text-xs">Saldo inicial</Label>
              <Input id="acc-balance" inputMode="decimal" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} disabled={pending} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="acc-date" className="text-xs">Saldo em</Label>
              <Input id="acc-date" type="date" value={initialDate} onChange={(e) => setInitialDate(e.target.value)} disabled={pending} />
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            O saldo é sempre calculado: saldo inicial + recebimentos − pagamentos registrados nesta conta a partir da data do saldo inicial.
          </p>
        </Card>
      )}

      {accounts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Nenhuma conta cadastrada"
          description="Cadastre as contas/carteiras deste espaço para registrar recebimentos e pagamentos."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.map((a) => {
            const balance = balances.get(a.id) ?? 0;
            return (
              <div key={a.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{a.name}</p>
                    {!a.is_active && <StatusBadge status="inativo" />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Saldo inicial {formatCurrency(Number(a.initial_balance))} em {formatDate(a.initial_balance_date)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                  <span className={`text-sm font-semibold tabular-nums ${balance < 0 ? "text-destructive" : "text-foreground"}`}>
                    {formatCurrency(balance)}
                  </span>
                  {permissions.canEdit && (
                    <>
                      <Switch
                        checked={a.is_active}
                        onCheckedChange={(checked) => toggle(a, checked)}
                        aria-label={a.is_active ? `Desativar ${a.name}` : `Ativar ${a.name}`}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(a)} aria-label={`Editar ${a.name}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  {permissions.canDelete && (
                    <ConfirmActionButton
                      label={<Trash2 className="h-3.5 w-3.5" />}
                      title="Excluir esta conta?"
                      description="Só é possível se não houver recebimentos/pagamentos nela — caso contrário, desative em vez de excluir."
                      confirmLabel="Excluir"
                      size="icon"
                      onConfirm={() => deleteFinancialAccountAction(scope, a.id)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <EditAccountDialog scope={scope} account={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditAccountDialog({ scope, account, onClose }: { scope: FinancialScope; account: FinancialAccount; onClose: () => void }) {
  const [name, setName] = useState(account.name);
  const [initialBalance, setInitialBalance] = useState(Number(account.initial_balance).toFixed(2).replace(".", ","));
  const [initialDate, setInitialDate] = useState(account.initial_balance_date);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const balance = parseMoneyInput(initialBalance || "0");
    if (!Number.isFinite(balance)) return toast.error("Saldo inicial inválido.");
    setPending(true);
    const result = await updateFinancialAccountAction(scope, account.id, {
      name,
      initialBalance: balance,
      initialBalanceDate: initialDate,
    });
    setPending(false);
    if (result.error) return toast.error(result.error);
    toast.success(result.success ?? "Conta atualizada.");
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar conta</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-acc-name">Nome</Label>
            <Input id="edit-acc-name" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-acc-balance">Saldo inicial</Label>
              <Input id="edit-acc-balance" inputMode="decimal" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} disabled={pending} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-acc-date">Saldo em</Label>
              <Input id="edit-acc-date" type="date" value={initialDate} onChange={(e) => setInitialDate(e.target.value)} disabled={pending} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Movimentações com data anterior ao saldo inicial não alteram o saldo (consideram-se já incluídas nele).
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoriesTab({
  scope,
  categories,
  permissions,
}: {
  scope: FinancialScope;
  categories: FinancialCategory[];
  permissions: ConfigPermissions;
}) {
  const [kind, setKind] = useState<FinancialKind>("saida");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
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
      {permissions.canCreate && (
        <Card className="p-3">
          <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex gap-2" role="radiogroup" aria-label="Tipo da categoria">
              <Button type="button" size="sm" role="radio" aria-checked={kind === "entrada"} variant={kind === "entrada" ? "default" : "outline"} onClick={() => setKind("entrada")}>
                Entrada
              </Button>
              <Button type="button" size="sm" role="radio" aria-checked={kind === "saida"} variant={kind === "saida" ? "default" : "outline"} onClick={() => setKind("saida")}>
                Saída
              </Button>
            </div>
            <div className="flex-1">
              <Input placeholder="Nome da categoria" aria-label="Nome da categoria" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </form>
        </Card>
      )}

      {(["entrada", "saida"] as FinancialKind[]).map((k) => (
        <div key={k}>
          <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">{k === "entrada" ? "Entrada" : "Saída"}</p>
          <div className="flex flex-col gap-2">
            {categories.filter((c) => c.kind === k).length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma categoria.</p>
            ) : (
              categories
                .filter((c) => c.kind === k)
                .map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-2.5">
                    <span className={`text-sm ${c.is_active ? "text-foreground" : "text-muted-foreground line-through"}`}>{c.name}</span>
                    <div className="flex items-center gap-2">
                      {permissions.canEdit && (
                        <Switch
                          checked={c.is_active}
                          aria-label={c.is_active ? `Desativar ${c.name}` : `Ativar ${c.name}`}
                          onCheckedChange={(checked) =>
                            updateFinancialCategoryAction(scope, c.id, c.name, checked).then((r) => r.error && toast.error(r.error))
                          }
                        />
                      )}
                      {permissions.canDelete && (
                        <ConfirmActionButton
                          label={<Trash2 className="h-3.5 w-3.5" />}
                          title="Excluir esta categoria?"
                          description="Lançamentos que usam esta categoria ficam sem categoria. Se preferir manter o histórico classificado, desative em vez de excluir."
                          confirmLabel="Excluir"
                          size="icon"
                          onConfirm={() => deleteFinancialCategoryAction(scope, c.id)}
                        />
                      )}
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

function ReferenceTypesTab({
  scope,
  referenceTypes,
  permissions,
}: {
  scope: FinancialScope;
  referenceTypes: FinancialReferenceType[];
  permissions: ConfigPermissions;
}) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
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
      {permissions.canCreate && (
        <Card className="p-3">
          <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1">
              <Input placeholder='Nome (ex.: "Manutenção")' aria-label="Nome" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </form>
        </Card>
      )}

      {referenceTypes.length === 0 ? (
        <EmptyState title='Nenhum "referente a" cadastrado' />
      ) : (
        <div className="flex flex-col gap-2">
          {referenceTypes.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-2.5">
              <span className={`text-sm ${r.is_active ? "text-foreground" : "text-muted-foreground line-through"}`}>{r.name}</span>
              <div className="flex items-center gap-2">
                {permissions.canEdit && (
                  <Switch
                    checked={r.is_active}
                    aria-label={r.is_active ? `Desativar ${r.name}` : `Ativar ${r.name}`}
                    onCheckedChange={(checked) =>
                      updateFinancialReferenceTypeAction(scope, r.id, r.name, checked).then((res) => res.error && toast.error(res.error))
                    }
                  />
                )}
                {permissions.canDelete && (
                  <ConfirmActionButton
                    label={<Trash2 className="h-3.5 w-3.5" />}
                    title='Excluir este "referente a"?'
                    description="Lançamentos que usam este item ficam sem classificação. Se preferir, desative em vez de excluir."
                    confirmLabel="Excluir"
                    size="icon"
                    onConfirm={() => deleteFinancialReferenceTypeAction(scope, r.id)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
