"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createMovementAction, type MovementFormInput } from "@/lib/supabase/financial-actions";
import { formatCurrency, formatDate, parseMoneyInput, todayKeySaoPaulo } from "@/lib/format";
import { firstDueOnOrAfter, nextOccurrence } from "@/lib/recurrence";
import { Switch } from "@/components/ui/switch";
import { FREQUENCY_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/finance-labels";
import type {
  Client,
  ClientService,
  FinancialAccount,
  FinancialCategory,
  FinancialKind,
  FinancialOriginType,
  FinancialPaymentMethod,
  FinancialReferenceType,
  FinancialRecurrenceFrequency,
  Service,
} from "@/types/database.types";
import type { FinancialScope } from "@/lib/space-slugs";

interface Props {
  scope: FinancialScope;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  clientServices: ClientService[];
  services: Service[];
  categories: FinancialCategory[];
  referenceTypes: FinancialReferenceType[];
  accounts: FinancialAccount[];
  onSaved?: () => void;
  /** Abre direto no formulário de entrada/saída (ex.: "Nova conta a pagar"), sem a escolha inicial. */
  initialKind?: FinancialKind;
  /** false = já começa como pendente (A receber / A pagar). Padrão: true (já recebido/pago). */
  defaultSettled?: boolean;
}

export function NovaMovimentacaoDialog(props: Props) {
  const { open, onOpenChange, initialKind } = props;
  const [chosenKind, setKind] = useState<FinancialKind | null>(null);
  const kind = chosenKind ?? initialKind ?? null;

  function handleOpenChange(next: boolean) {
    if (!next) setKind(null);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {open && !kind && (
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova movimentação</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-24 flex-col gap-2 border-success/40 text-success hover:bg-success/10"
              onClick={() => setKind("entrada")}
            >
              <ArrowUpCircle className="h-6 w-6" /> Entrada
            </Button>
            <Button
              variant="outline"
              className="h-24 flex-col gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setKind("saida")}
            >
              <ArrowDownCircle className="h-6 w-6" /> Saída
            </Button>
          </div>
        </DialogContent>
      )}
      {open && kind && (
        <MovementForm
          {...props}
          kind={kind}
          onBack={initialKind ? () => handleOpenChange(false) : () => setKind(null)}
          onOpenChange={handleOpenChange}
        />
      )}
    </Dialog>
  );
}

function MovementForm({
  scope,
  kind,
  clients,
  clientServices,
  services,
  categories,
  referenceTypes,
  accounts,
  onBack,
  onOpenChange,
  onSaved,
  initialKind,
  defaultSettled,
}: Props & { kind: FinancialKind; onBack: () => void }) {
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientServiceId, setClientServiceId] = useState("");
  const [referenceTypeId, setReferenceTypeId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplierName, setSupplierName] = useState("");

  const [originalAmount, setOriginalAmount] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [additionAmount, setAdditionAmount] = useState("");

  const [dueDate, setDueDate] = useState(todayKeySaoPaulo());
  const [paymentDate, setPaymentDate] = useState(todayKeySaoPaulo());
  const [competencyDate, setCompetencyDate] = useState("");

  const [tipo, setTipo] = useState<FinancialOriginType>("unico");
  const [installmentCount, setInstallmentCount] = useState("3");

  const [frequency, setFrequency] = useState<FinancialRecurrenceFrequency>("mensal");
  const [interval, setInterval_] = useState("2");
  const [dueDay, setDueDay] = useState(String(Number(todayKeySaoPaulo().slice(8, 10))));
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState("");

  const [settled, setSettled] = useState(defaultSettled ?? true);
  const [paymentMethod, setPaymentMethod] = useState<FinancialPaymentMethod>("pix");
  const [accountId, setAccountId] = useState(accounts.find((a) => a.is_active)?.id ?? "");
  const activeAccounts = accounts.filter((a) => a.is_active);

  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  const relevantCategories = useMemo(() => categories.filter((c) => c.kind === kind && c.is_active), [categories, kind]);
  const clientContracts = useMemo(
    () => clientServices.filter((cs) => cs.client_id === clientId),
    [clientServices, clientId]
  );
  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

  const original = parseMoneyInput(originalAmount) || 0;
  const discount = parseMoneyInput(discountAmount) || 0;
  const addition = parseMoneyInput(additionAmount) || 0;
  const final = original - discount + addition;

  function handleClientChange(id: string) {
    setClientId(id === "nenhum" ? "" : id);
    setClientServiceId("");
  }

  function handleClientServiceChange(id: string) {
    setClientServiceId(id === "nenhum" ? "" : id);
    if (id !== "nenhum") {
      const cs = clientContracts.find((c) => c.id === id);
      if (cs && !originalAmount) setOriginalAmount(Number(cs.price).toFixed(2).replace(".", ","));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return toast.error("Descreva a movimentação.");
    if (!original || original <= 0) return toast.error("Informe o valor.");
    if (!dueDate) return toast.error("Escolha a data.");
    if (final <= 0) return toast.error("O valor final precisa ser maior que zero.");
    // Recorrente: cada competência nasce pendente e é paga individualmente.
    const isSettled = tipo === "unico" ? settled : false;
    const usesDay = tipo === "recorrente" && frequency !== "semanal";
    if (usesDay && !(Number(dueDay) >= 1 && Number(dueDay) <= 31)) return toast.error("Dia do vencimento precisa ser entre 1 e 31.");
    if (tipo === "recorrente" && hasEndDate && !endDate) return toast.error("Informe a data de término ou desmarque a opção.");
    if (isSettled && !accountId) return toast.error("Escolha a conta que recebeu/pagou.");

    const input: MovementFormInput = {
      kind,
      description,
      clientId: clientId || undefined,
      clientServiceId: clientServiceId || undefined,
      referenceTypeId: referenceTypeId || undefined,
      categoryId: categoryId || undefined,
      supplierName: supplierName || undefined,
      originalAmount: original,
      discountAmount: discount || undefined,
      additionAmount: addition || undefined,
      dueDate,
      competencyDate: tipo === "recorrente" ? undefined : competencyDate || undefined,
      tipo,
      installmentCount: tipo === "parcelado" ? parseInt(installmentCount, 10) : undefined,
      recurrenceFrequency: tipo === "recorrente" ? frequency : undefined,
      recurrenceInterval: tipo === "recorrente" && (frequency === "a_cada_x_meses" || frequency === "customizado") ? parseInt(interval, 10) : undefined,
      recurrenceEndType: tipo === "recorrente" ? (hasEndDate ? "em_data" : "nunca") : undefined,
      recurrenceEndDate: tipo === "recorrente" && hasEndDate ? endDate : undefined,
      recurrenceDay: usesDay ? Number(dueDay) : undefined,
      settled: isSettled,
      paymentMethod: isSettled ? paymentMethod : undefined,
      accountId: isSettled ? accountId : undefined,
      paymentDate: isSettled ? paymentDate : undefined,
      notes: notes || undefined,
    };

    setPending(true);
    const result = await createMovementAction(scope, input);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(result.success ?? "Movimentação criada.");
    onOpenChange(false);
    onSaved?.();
  }

  const isEntrada = kind === "entrada";

  const recurrencePreview = (() => {
    if (tipo !== "recorrente" || !dueDate) return null;
    const day = Number(dueDay);
    if (frequency !== "semanal" && !(day >= 1 && day <= 31)) return null;
    const first = frequency === "semanal" ? dueDate : firstDueOnOrAfter(dueDate, day);
    const today = todayKeySaoPaulo();
    let late = 0;
    let cursor = first;
    for (let guard = 0; guard < 240 && cursor < today; guard++) {
      late += 1;
      cursor = nextOccurrence(cursor, frequency, parseInt(interval, 10) || null, frequency === "semanal" ? undefined : day);
    }
    const every =
      frequency === "semanal" ? "toda semana" : frequency === "mensal" ? `todo dia ${day}` : `dia ${day}, ${FREQUENCY_LABEL[frequency].toLowerCase()}`;
    const lateNote = late > 0 ? ` · ${late} vencimento(s) já passaram e entrarão como atrasados` : "";
    return `1º vencimento em ${formatDate(first)}, depois ${every}${final > 0 ? ` · ${formatCurrency(final)}` : ""}${lateNote}.`;
  })();

  return (
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle className={isEntrada ? "text-success" : "text-destructive"}>
          {initialKind && defaultSettled === false
            ? isEntrada
              ? "Nova conta a receber"
              : "Nova conta a pagar"
            : `Nova ${isEntrada ? "entrada" : "saída"}`}
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto pr-1">
        <div className="flex flex-col gap-1.5">
          <Label>Descrição *</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={pending} autoFocus />
        </div>

        {isEntrada && clients.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Cliente</Label>
              <Select value={clientId || "nenhum"} onValueChange={handleClientChange} disabled={pending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Sem cliente</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Serviço contratado</Label>
              <Select value={clientServiceId || "nenhum"} onValueChange={handleClientServiceChange} disabled={pending || !clientId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Sem serviço</SelectItem>
                  {clientContracts.map((cs) => (
                    <SelectItem key={cs.id} value={cs.id}>{serviceById.get(cs.service_id)?.name ?? "Serviço"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {!isEntrada && (
          <div className="flex flex-col gap-1.5">
            <Label>Fornecedor</Label>
            <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} disabled={pending} placeholder="Opcional" />
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {isEntrada && (
            <div className="flex flex-col gap-1.5">
              <Label>Referente a</Label>
              <Select value={referenceTypeId || "nenhum"} onValueChange={(v) => setReferenceTypeId(v === "nenhum" ? "" : v)} disabled={pending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Não especificado</SelectItem>
                  {referenceTypes.filter((r) => r.is_active).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Categoria</Label>
            <Select value={categoryId || "nenhuma"} onValueChange={(v) => setCategoryId(v === "nenhuma" ? "" : v)} disabled={pending}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhuma">Sem categoria</SelectItem>
                {relevantCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Valor original *</Label>
            <Input inputMode="decimal" value={originalAmount} onChange={(e) => setOriginalAmount(e.target.value)} disabled={pending} placeholder="0,00" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Desconto</Label>
            <Input inputMode="decimal" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} disabled={pending} placeholder="0,00" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Acréscimo</Label>
            <Input inputMode="decimal" value={additionAmount} onChange={(e) => setAdditionAmount(e.target.value)} disabled={pending} placeholder="0,00" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Valor final: <span className="font-medium text-foreground">{final.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
        </p>

        <div className="flex flex-col gap-1.5">
          <Label>Tipo</Label>
          <div className="flex gap-2">
            {(["unico", "parcelado", "recorrente"] as FinancialOriginType[]).map((t) => (
              <Button key={t} type="button" size="sm" variant={tipo === t ? "default" : "outline"} onClick={() => setTipo(t)} disabled={pending}>
                {t === "unico" ? "Único" : t === "parcelado" ? "Parcelado" : "Recorrente"}
              </Button>
            ))}
          </div>
        </div>

        {tipo === "parcelado" && (
          <div className="flex flex-col gap-1.5">
            <Label>Número de parcelas</Label>
            <Input type="number" min={2} value={installmentCount} onChange={(e) => setInstallmentCount(e.target.value)} disabled={pending} />
            <p className="text-xs text-muted-foreground">
              {installmentCount && original > 0
                ? `${installmentCount}x de ${(final / (parseInt(installmentCount, 10) || 1)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                : null}
            </p>
          </div>
        )}

        {tipo === "recorrente" && (
          <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-foreground">Conta recorrente</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label>Repete</Label>
                <Select value={frequency} onValueChange={(v) => setFrequency(v as FinancialRecurrenceFrequency)} disabled={pending}>
                  <SelectTrigger aria-label="Repete"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FREQUENCY_LABEL) as FinancialRecurrenceFrequency[]).map((f) => (
                      <SelectItem key={f} value={f}>{f === "mensal" ? "Mensalmente" : FREQUENCY_LABEL[f]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(frequency === "a_cada_x_meses" || frequency === "customizado") && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mov-interval">A cada (meses)</Label>
                  <Input id="mov-interval" type="number" min={1} value={interval} onChange={(e) => setInterval_(e.target.value)} disabled={pending} />
                </div>
              )}
              {frequency !== "semanal" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mov-due-day">Vence todo dia</Label>
                  <Input id="mov-due-day" type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} disabled={pending} />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mov-start">Começa em</Label>
                <Input id="mov-start" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={pending} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Switch checked={hasEndDate} onCheckedChange={setHasEndDate} disabled={pending} aria-label="Definir data de término" />
                {hasEndDate ? "Termina em" : "Sem data de término"}
              </label>
              {hasEndDate && (
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={pending} aria-label="Data de término" className="sm:max-w-[12rem]" />
              )}
            </div>
            {recurrencePreview && <p className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">{recurrencePreview}</p>}
            <p className="text-xs text-muted-foreground">
              Cada vencimento é uma competência separada: pagar um mês não quita o próximo. A recorrência continua até você cancelá-la.
            </p>
          </div>
        )}

        {tipo !== "recorrente" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>
              {tipo === "parcelado" ? "Vencimento da 1ª parcela" : settled ? "Data" : "Vencimento"} *
            </Label>
            <div className="flex gap-2">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={pending} />
              <Button type="button" variant="outline" size="sm" onClick={() => setDueDate(todayKeySaoPaulo())} disabled={pending}>
                Hoje
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Competência</Label>
            <Input type="date" value={competencyDate} onChange={(e) => setCompetencyDate(e.target.value)} disabled={pending} placeholder="Opcional" />
          </div>
        </div>
        )}

        {tipo === "unico" && (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <Label>Status</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={settled ? "default" : "outline"} onClick={() => setSettled(true)} disabled={pending}>
                {isEntrada ? "Recebido" : "Pago"}
              </Button>
              <Button type="button" size="sm" variant={!settled ? "default" : "outline"} onClick={() => setSettled(false)} disabled={pending}>
                Pendente
              </Button>
            </div>
            {!settled && (
              <p className="text-xs text-muted-foreground">
                Vira conta a {isEntrada ? "receber" : "pagar"} — sem forma de pagamento/conta ainda.
              </p>
            )}
            {settled && (
              <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Forma de pagamento</Label>
                  <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as FinancialPaymentMethod)} disabled={pending}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PAYMENT_METHOD_LABEL) as FinancialPaymentMethod[]).map((m) => (
                        <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Conta</Label>
                  <Select value={accountId} onValueChange={setAccountId} disabled={pending || activeAccounts.length === 0}>
                    <SelectTrigger aria-label="Conta"><SelectValue placeholder={activeAccounts.length === 0 ? "Cadastre uma conta" : "Escolha a conta"} /></SelectTrigger>
                    <SelectContent>
                      {activeAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label>Data real do {isEntrada ? "recebimento" : "pagamento"}</Label>
                  <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} disabled={pending} />
                </div>
                {activeAccounts.length === 0 && (
                  <p className="text-xs text-warning sm:col-span-2">
                    Nenhuma conta ativa — cadastre em &quot;Contas e categorias&quot; ou lance como pendente.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {tipo === "parcelado" && (
          <p className="text-xs text-muted-foreground">
            Parcelamento sempre entra como pendente — marque cada parcela como {isEntrada ? "recebida" : "paga"} individualmente.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>Observações</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} rows={2} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onBack} disabled={pending}>Voltar</Button>
          <Button type="submit" disabled={pending}>{pending ? "Salvando…" : settled && tipo !== "parcelado" ? "Registrar" : "Lançar como pendente"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
