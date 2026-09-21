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
import { toDateKey } from "@/lib/format";
import type {
  Client,
  ClientService,
  FinancialAccount,
  FinancialCategory,
  FinancialKind,
  FinancialOriginType,
  FinancialPaymentMethod,
  FinancialReferenceType,
  FinancialRecurrenceEndType,
  FinancialRecurrenceFrequency,
  Service,
} from "@/types/database.types";
import type { FinancialScope } from "@/lib/space-slugs";

const PAYMENT_METHOD_LABEL: Record<FinancialPaymentMethod, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  boleto: "Boleto",
  transferencia: "Transferência",
  outro: "Outro",
};

const FREQUENCY_LABEL: Record<FinancialRecurrenceFrequency, string> = {
  semanal: "Semanal",
  mensal: "Mensal",
  a_cada_x_meses: "A cada X meses",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
  customizado: "Customizado",
};

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
}

export function NovaMovimentacaoDialog(props: Props) {
  const { open, onOpenChange } = props;
  const [kind, setKind] = useState<FinancialKind | null>(null);

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
          onBack={() => setKind(null)}
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

  const [dueDate, setDueDate] = useState(toDateKey(new Date()));
  const [competencyDate, setCompetencyDate] = useState("");

  const [tipo, setTipo] = useState<FinancialOriginType>("unico");
  const [installmentCount, setInstallmentCount] = useState("3");

  const [frequency, setFrequency] = useState<FinancialRecurrenceFrequency>("mensal");
  const [interval, setInterval_] = useState("2");
  const [endType, setEndType] = useState<FinancialRecurrenceEndType>("nunca");
  const [endDate, setEndDate] = useState("");
  const [endOccurrences, setEndOccurrences] = useState("12");

  const [settled, setSettled] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<FinancialPaymentMethod>("pix");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");

  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  const relevantCategories = useMemo(() => categories.filter((c) => c.kind === kind && c.is_active), [categories, kind]);
  const clientContracts = useMemo(
    () => clientServices.filter((cs) => cs.client_id === clientId),
    [clientServices, clientId]
  );
  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

  const original = parseFloat(originalAmount.replace(",", ".")) || 0;
  const discount = parseFloat(discountAmount.replace(",", ".")) || 0;
  const addition = parseFloat(additionAmount.replace(",", ".")) || 0;
  const final = original - discount + addition;

  function handleClientChange(id: string) {
    setClientId(id === "nenhum" ? "" : id);
    setClientServiceId("");
  }

  function handleClientServiceChange(id: string) {
    setClientServiceId(id === "nenhum" ? "" : id);
    if (id !== "nenhum") {
      const cs = clientContracts.find((c) => c.id === id);
      if (cs && !originalAmount) setOriginalAmount(String(cs.price));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return toast.error("Descreva a movimentação.");
    if (!original || original <= 0) return toast.error("Informe o valor.");
    if (!dueDate) return toast.error("Escolha a data.");
    if (settled && !accountId) return toast.error("Escolha a conta.");

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
      competencyDate: competencyDate || undefined,
      tipo,
      installmentCount: tipo === "parcelado" ? parseInt(installmentCount, 10) : undefined,
      recurrenceFrequency: tipo === "recorrente" ? frequency : undefined,
      recurrenceInterval: tipo === "recorrente" ? parseInt(interval, 10) : undefined,
      recurrenceEndType: tipo === "recorrente" ? endType : undefined,
      recurrenceEndDate: tipo === "recorrente" && endType === "em_data" ? endDate : undefined,
      recurrenceEndOccurrences: tipo === "recorrente" && endType === "apos_ocorrencias" ? parseInt(endOccurrences, 10) : undefined,
      settled: tipo === "parcelado" ? false : settled,
      paymentMethod: settled ? paymentMethod : undefined,
      accountId: settled ? accountId : undefined,
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

  return (
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle className={isEntrada ? "text-success" : "text-destructive"}>
          Nova {isEntrada ? "entrada" : "saída"}
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Frequência</Label>
                <Select value={frequency} onValueChange={(v) => setFrequency(v as FinancialRecurrenceFrequency)} disabled={pending}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FREQUENCY_LABEL) as FinancialRecurrenceFrequency[]).map((f) => (
                      <SelectItem key={f} value={f}>{FREQUENCY_LABEL[f]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(frequency === "a_cada_x_meses" || frequency === "customizado") && (
                <div className="flex flex-col gap-1.5">
                  <Label>Intervalo (meses)</Label>
                  <Input type="number" min={1} value={interval} onChange={(e) => setInterval_(e.target.value)} disabled={pending} />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Término</Label>
              <div className="flex gap-2">
                {(["nunca", "em_data", "apos_ocorrencias"] as FinancialRecurrenceEndType[]).map((et) => (
                  <Button key={et} type="button" size="sm" variant={endType === et ? "default" : "outline"} onClick={() => setEndType(et)} disabled={pending}>
                    {et === "nunca" ? "Sem fim" : et === "em_data" ? "Em data" : "Após X ocorrências"}
                  </Button>
                ))}
              </div>
              {endType === "em_data" && (
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={pending} className="mt-2" />
              )}
              {endType === "apos_ocorrencias" && (
                <Input type="number" min={1} value={endOccurrences} onChange={(e) => setEndOccurrences(e.target.value)} disabled={pending} className="mt-2" />
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Data {tipo === "recorrente" ? "da primeira ocorrência" : "real da movimentação"} *</Label>
            <div className="flex gap-2">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={pending} />
              <Button type="button" variant="outline" size="sm" onClick={() => setDueDate(toDateKey(new Date()))} disabled={pending}>
                Usar hoje
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Competência</Label>
            <Input type="date" value={competencyDate} onChange={(e) => setCompetencyDate(e.target.value)} disabled={pending} placeholder="Opcional" />
          </div>
        </div>

        {tipo !== "parcelado" && (
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
                  <Select value={accountId} onValueChange={setAccountId} disabled={pending || accounts.length === 0}>
                    <SelectTrigger><SelectValue placeholder={accounts.length === 0 ? "Cadastre uma conta" : undefined} /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
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
          <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Criar movimentação"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
