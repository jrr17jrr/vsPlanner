"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Plus,
  Trash2,
  Mail,
  Phone,
  AtSign,
  Globe,
  CalendarClock,
  Briefcase,
  Wallet,
  ExternalLink,
  MoreVertical,
  PauseCircle,
  PlayCircle,
  XCircle,
  Repeat,
  HandCoins,
  CheckCircle2,
  Receipt,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyCard } from "@/components/shared/money-card";
import { ConfirmActionButton } from "@/components/shared/confirm-action-button";
import { AsyncConfirmDialog } from "@/components/shared/async-confirm-dialog";
import { WhatsAppButton } from "@/components/visionario/reunioes/whatsapp-button";
import { ClientFormDialog } from "@/components/visionario/clientes/client-form-dialog";
import { ContractServiceDialog } from "@/components/visionario/clientes/contract-service-dialog";
import { MarkPaymentDialog } from "@/components/visionario/financeiro/mark-payment-dialog";
import { deleteClientAction } from "@/lib/supabase/clients-actions";
import {
  deleteClientServiceAction,
  generateContractChargesAction,
  setClientServiceStatusAction,
} from "@/lib/supabase/client-services-actions";
import { chargeStatus, clientFinancialSummary, contractMonthlyValue, remainingAmount } from "@/lib/financial-calc";
import {
  CONTRACT_STATUS_BADGE,
  PAYMENT_METHOD_LABEL,
  chargeBadgeStatus,
  contractBillingLabel,
  contractPriceSuffix,
} from "@/lib/finance-labels";
import { firstDueOnOrAfter } from "@/lib/recurrence";
import { formatCurrency, formatDate, formatDateLong, todayKeySaoPaulo } from "@/lib/format";
import type {
  Client,
  ClientService,
  ClientServiceStatus,
  FinancialAccount,
  FinancialCharge,
  FinancialPayment,
  Meeting,
  Sale,
  Service,
  SpaceMemberProfile,
  ClientSite,
  WorkItem,
} from "@/types/database.types";

type ContractAction =
  | { type: "status"; contract: ClientService; status: ClientServiceStatus }
  | { type: "delete"; contract: ClientService }
  | { type: "generate"; contract: ClientService };

export function ClientDetailClient({
  client,
  contracts,
  services,
  meetings,
  members,
  workItems,
  sites,
  sales,
  charges,
  payments,
  accounts,
  contractIdsWithFinance,
  permissions,
}: {
  client: Client;
  contracts: ClientService[];
  services: Service[];
  meetings: Meeting[];
  members: SpaceMemberProfile[];
  workItems: WorkItem[];
  sites: ClientSite[];
  sales: Sale[];
  charges: FinancialCharge[];
  payments: FinancialPayment[];
  accounts: FinancialAccount[];
  contractIdsWithFinance: string[];
  permissions: {
    canEditClient: boolean;
    canDeleteClient: boolean;
    canCreateContract: boolean;
    canEditContract: boolean;
    canDeleteContract: boolean;
    canViewTrabalhos: boolean;
    canViewFinanceiro: boolean;
    canEditFinanceiro: boolean;
    canViewSites: boolean;
    canViewVendedores: boolean;
  };
}) {
  const router = useRouter();
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [contractFormOpen, setContractFormOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<ClientService | undefined>();
  const [pendingAction, setPendingAction] = useState<ContractAction | null>(null);
  const [markingCharge, setMarkingCharge] = useState<FinancialCharge | null>(null);

  const todayKey = todayKeySaoPaulo();
  const activeCatalog = services.filter((s) => s.status === "ativo");
  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const financeLinked = useMemo(() => new Set(contractIdsWithFinance), [contractIdsWithFinance]);
  const responsibleName = client.responsible_id ? members.find((m) => m.id === client.responsible_id)?.name : undefined;

  const summary = useMemo(() => clientFinancialSummary(contracts, charges, payments), [contracts, charges, payments]);
  const activeContracts = contracts.filter((c) => c.status === "ativo");

  const openCharges = useMemo(
    () =>
      charges
        .filter((c) => c.kind === "entrada" && c.status !== "cancelado" && chargeStatus(c, payments) !== "pago")
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [charges, payments]
  );
  const chargeById = useMemo(() => new Map(charges.map((c) => [c.id, c])), [charges]);

  function nextDueFor(contract: ClientService): string | null {
    const open = openCharges.find((c) => c.client_service_id === contract.id);
    if (open) return open.due_date;
    if (contract.status === "ativo" && contract.billing_type === "recorrente" && contract.due_day) {
      return firstDueOnOrAfter(todayKey > contract.start_date ? todayKey : contract.start_date, contract.due_day);
    }
    return null;
  }

  const nextMeeting = meetings
    .filter((m) => m.status === "agendada" && m.meeting_date >= todayKey)
    .sort((a, b) => (a.meeting_date + a.start_time).localeCompare(b.meeting_date + b.start_time))[0];
  const pendingWorkItems = workItems.filter((w) => w.status !== "concluido");

  async function runContractAction(action: ContractAction) {
    if (action.type === "status") return setClientServiceStatusAction(action.contract.id, client.id, action.status);
    if (action.type === "generate") return generateContractChargesAction(action.contract.id, client.id);
    return deleteClientServiceAction(action.contract.id, client.id);
  }

  const confirmCopy = (() => {
    if (!pendingAction) return null;
    const name = serviceById.get(pendingAction.contract.service_id)?.name ?? "serviço";
    if (pendingAction.type === "delete") {
      return {
        title: `Excluir "${name}" deste cliente?`,
        description:
          "Só é possível se nenhuma cobrança dele tiver pagamento — nesse caso as cobranças em aberto também são removidas. Com pagamentos, encerre em vez de excluir.",
        confirmLabel: "Excluir",
        destructive: true,
      };
    }
    if (pendingAction.type === "generate") {
      return {
        title: `Gerar cobranças de "${name}"?`,
        description:
          "Este serviço foi contratado antes da integração com o Financeiro. As cobranças começam na competência atual (meses anteriores não são lançados).",
        confirmLabel: "Gerar cobranças",
        destructive: false,
      };
    }
    if (pendingAction.status === "cancelado") {
      return {
        title: `Encerrar "${name}"?`,
        description:
          "Deixa de contar na receita recorrente e as cobranças futuras ainda não pagas são canceladas. Cobranças atrasadas e o histórico de pagamentos são mantidos.",
        confirmLabel: "Encerrar serviço",
        destructive: true,
      };
    }
    if (pendingAction.status === "inativo") {
      return {
        title: `Pausar "${name}"?`,
        description:
          "Deixa de contar na receita recorrente e para de gerar novas cobranças. Ao reativar, a cobrança recomeça na próxima competência.",
        confirmLabel: "Pausar",
        destructive: false,
      };
    }
    return {
      title: `Reativar "${name}"?`,
      description: "Volta a contar na receita recorrente e as cobranças recomeçam a partir da próxima competência.",
      confirmLabel: "Reativar",
      destructive: false,
    };
  })();

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" className="w-fit" onClick={() => router.push("/visionario/clientes")}>
        <ArrowLeft className="h-4 w-4" /> Voltar para clientes
      </Button>

      <PageHeader
        title={client.name}
        description={client.company ?? undefined}
        actions={
          <>
            <StatusBadge status={client.status} />
            {permissions.canEditClient && (
              <Button size="sm" variant="outline" onClick={() => setEditClientOpen(true)}>
                <Pencil className="h-4 w-4" /> Editar
              </Button>
            )}
            {permissions.canDeleteClient && (
              <ConfirmActionButton
                label={
                  <>
                    <Trash2 className="h-4 w-4" /> Excluir
                  </>
                }
                title="Excluir este cliente?"
                description="Remove o cliente e os serviços contratados dele. Se já houver pagamentos registrados, a exclusão é bloqueada — inative o cliente para manter o histórico."
                confirmLabel="Excluir"
                onConfirm={async () => {
                  const result = await deleteClientAction(client.id);
                  if (!result.error) router.push("/visionario/clientes");
                  return result;
                }}
              />
            )}
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <WhatsAppButton phone={client.whatsapp || client.phone} />
        {client.instagram && (
          <Button variant="outline" size="sm" asChild>
            <a href={client.instagram} target="_blank" rel="noopener noreferrer">
              <AtSign className="h-3.5 w-3.5" /> Instagram
            </a>
          </Button>
        )}
        {client.website && (
          <Button variant="outline" size="sm" asChild>
            <a href={client.website} target="_blank" rel="noopener noreferrer">
              <Globe className="h-3.5 w-3.5" /> Site
            </a>
          </Button>
        )}
        {client.email && (
          <Button variant="outline" size="sm" asChild>
            <a href={`mailto:${client.email}`}>
              <Mail className="h-3.5 w-3.5" /> E-mail
            </a>
          </Button>
        )}
      </div>

      <Tabs defaultValue="resumo">
        <TabsList className="flex-wrap">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="servicos">Serviços contratados</TabsTrigger>
          {permissions.canViewFinanceiro && <TabsTrigger value="financeiro">Financeiro</TabsTrigger>}
          <TabsTrigger value="reunioes">Reuniões</TabsTrigger>
          {permissions.canViewTrabalhos && <TabsTrigger value="trabalhos">Trabalhos</TabsTrigger>}
          {permissions.canViewSites && <TabsTrigger value="sites">Sites</TabsTrigger>}
          {permissions.canViewVendedores && <TabsTrigger value="vendas">Vendas</TabsTrigger>}
          <TabsTrigger value="observacoes">Observações</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MoneyCard
              label="Receita recorrente"
              amount={summary.mrr}
              icon={Repeat}
              hint={`${activeContracts.length} serviço(s) ativo(s)`}
            />
            {permissions.canViewFinanceiro && (
              <>
                <MoneyCard
                  label="A receber"
                  amount={summary.aReceber}
                  icon={HandCoins}
                  tone={summary.aReceber > 0 ? "warning" : "default"}
                  hint={`${summary.pendingCount} cobrança(s) pendente(s)`}
                />
                <MoneyCard label="Total recebido" amount={summary.totalRecebido} icon={Wallet} tone="success" />
              </>
            )}
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground">Próxima reunião</p>
              {nextMeeting ? (
                <p className="mt-2 text-sm font-medium text-foreground">
                  {formatDate(nextMeeting.meeting_date)} às {nextMeeting.start_time.slice(0, 5)}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Nenhuma agendada</p>
              )}
            </Card>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Cliente desde</p>
              <p className="mt-1 text-sm font-medium text-foreground">{formatDate(client.joined_at)}</p>
              {responsibleName && <p className="text-xs text-muted-foreground">Responsável: {responsibleName}</p>}
            </Card>
            {permissions.canViewTrabalhos && (
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Trabalhos pendentes</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{pendingWorkItems.length}</p>
              </Card>
            )}
          </div>
          <Card className="mt-3 p-4">
            <p className="mb-2 text-sm font-medium text-foreground">Contato</p>
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              {client.phone && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" /> {client.phone}
                </p>
              )}
              {client.email && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" /> {client.email}
                </p>
              )}
              {!client.phone && !client.email && <p className="text-muted-foreground">Nenhum contato cadastrado.</p>}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="servicos">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Serviços contratados</h2>
              <p className="text-xs text-muted-foreground">
                Receita recorrente deste cliente: <span className="font-medium text-foreground">{formatCurrency(summary.mrr)}/mês</span>
              </p>
            </div>
            {permissions.canCreateContract && (
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <Button
                  size="sm"
                  disabled={activeCatalog.length === 0}
                  onClick={() => {
                    setEditingContract(undefined);
                    setContractFormOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" /> Adicionar serviço
                </Button>
                {activeCatalog.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Cadastre um serviço ativo em{" "}
                    <Link href="/visionario/servicos" className="text-primary hover:underline">
                      Serviços
                    </Link>{" "}
                    antes.
                  </p>
                )}
              </div>
            )}
          </div>

          {contracts.length === 0 ? (
            <EmptyState icon={Briefcase} title="Nenhum serviço contratado" description="Adicione um serviço para começar a gerar cobranças e receita recorrente." />
          ) : (
            <div className="flex flex-col gap-2">
              {contracts.map((cs) => {
                const svc = serviceById.get(cs.service_id);
                const nextDue = nextDueFor(cs);
                const monthly = contractMonthlyValue(cs);
                const legacy = permissions.canViewFinanceiro && cs.status === "ativo" && !financeLinked.has(cs.id);
                const canManage = permissions.canEditContract;
                const hasMenu = canManage || permissions.canDeleteContract;
                return (
                  <div key={cs.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{svc?.name ?? "Serviço"}</p>
                        <StatusBadge status={CONTRACT_STATUS_BADGE[cs.status]} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{contractBillingLabel(cs)}</p>
                      <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                        <div className="flex gap-1">
                          <dt>Início:</dt>
                          <dd className="text-foreground">{formatDate(cs.start_date)}</dd>
                        </div>
                        {nextDue && (
                          <div className="flex gap-1">
                            <dt>Próximo vencimento:</dt>
                            <dd className={nextDue < todayKey ? "text-destructive" : "text-foreground"}>{formatDate(nextDue)}</dd>
                          </div>
                        )}
                        {monthly > 0 && cs.frequency !== "mensal" && (
                          <div className="flex gap-1">
                            <dt>Equivale a:</dt>
                            <dd className="text-foreground">{formatCurrency(monthly)}/mês</dd>
                          </div>
                        )}
                      </dl>
                      {legacy && (
                        <p className="mt-1 text-xs text-warning">Sem cobranças no Financeiro (contratado antes da integração).</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {formatCurrency(Number(cs.price))}
                        <span className="text-xs font-normal text-muted-foreground">{contractPriceSuffix(cs)}</span>
                      </span>
                      {hasMenu && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Ações de ${svc?.name ?? "serviço"}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canManage && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditingContract(cs);
                                  setContractFormOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" /> Editar
                              </DropdownMenuItem>
                            )}
                            {canManage && legacy && permissions.canEditFinanceiro && (
                              <DropdownMenuItem onClick={() => setPendingAction({ type: "generate", contract: cs })}>
                                <Link2 className="h-4 w-4" /> Gerar cobranças no Financeiro
                              </DropdownMenuItem>
                            )}
                            {canManage && cs.status === "ativo" && (
                              <DropdownMenuItem onClick={() => setPendingAction({ type: "status", contract: cs, status: "inativo" })}>
                                <PauseCircle className="h-4 w-4" /> Pausar
                              </DropdownMenuItem>
                            )}
                            {canManage && cs.status !== "ativo" && (
                              <DropdownMenuItem onClick={() => setPendingAction({ type: "status", contract: cs, status: "ativo" })}>
                                <PlayCircle className="h-4 w-4" /> Reativar
                              </DropdownMenuItem>
                            )}
                            {canManage && cs.status !== "cancelado" && (
                              <DropdownMenuItem
                                onClick={() => setPendingAction({ type: "status", contract: cs, status: "cancelado" })}
                                className="text-destructive focus:text-destructive"
                              >
                                <XCircle className="h-4 w-4" /> Encerrar
                              </DropdownMenuItem>
                            )}
                            {permissions.canDeleteContract && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setPendingAction({ type: "delete", contract: cs })}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" /> Excluir
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {permissions.canViewFinanceiro && (
          <TabsContent value="financeiro">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MoneyCard label="Receita recorrente" amount={summary.mrr} icon={Repeat} />
              <MoneyCard label="A receber" amount={summary.aReceber} icon={HandCoins} tone={summary.aReceber > 0 ? "warning" : "default"} />
              <MoneyCard label="Total recebido" amount={summary.totalRecebido} icon={Wallet} tone="success" />
              <Card className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Cobranças pendentes</p>
                <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{summary.pendingCount}</p>
              </Card>
            </div>

            <section className="mt-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Cobranças pendentes</h2>
              {openCharges.length === 0 ? (
                <EmptyState icon={Receipt} title="Nenhuma cobrança pendente" description="Tudo recebido por aqui." />
              ) : (
                <div className="flex flex-col gap-2">
                  {openCharges.map((c) => {
                    const status = chargeStatus(c, payments);
                    const remaining = remainingAmount(c, payments);
                    const overdue = c.due_date < todayKey;
                    return (
                      <div key={c.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{c.description}</p>
                          <p className="text-xs text-muted-foreground">
                            Vencimento {formatDate(c.due_date)}
                            {c.installment_number && ` · parcela ${c.installment_number}/${c.installment_total}`}
                            {status === "parcial" && ` · restante ${formatCurrency(remaining)}`}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                          <StatusBadge status={chargeBadgeStatus("entrada", status, overdue)} />
                          <span className="text-sm font-medium tabular-nums">{formatCurrency(remaining)}</span>
                          {permissions.canEditFinanceiro && (
                            <Button size="sm" variant="outline" onClick={() => setMarkingCharge(c)}>
                              <CheckCircle2 className="h-3.5 w-3.5" /> Marcar como recebido
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="mt-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Histórico de pagamentos</h2>
              {summary.payments.length === 0 ? (
                <EmptyState icon={Wallet} title="Nenhum pagamento recebido ainda" />
              ) : (
                <div className="flex flex-col gap-2">
                  {summary.payments.map((p) => {
                    const charge = chargeById.get(p.charge_id);
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{charge?.description ?? "Cobrança"}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(p.payment_date)} · {PAYMENT_METHOD_LABEL[p.payment_method]}
                            {charge && ` · ref. vencimento ${formatDate(charge.due_date)}`}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-medium tabular-nums text-success">+{formatCurrency(Number(p.amount))}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </TabsContent>
        )}

        <TabsContent value="reunioes">
          {meetings.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Nenhuma reunião registrada com este cliente" />
          ) : (
            <div className="flex flex-col gap-2">
              {meetings.map((m) => (
                <Link
                  key={m.id}
                  href={`/visionario/reunioes/${m.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateLong(m.meeting_date)} às {m.start_time.slice(0, 5)}
                    </p>
                  </div>
                  <StatusBadge status={m.status} className="shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {permissions.canViewTrabalhos && (
          <TabsContent value="trabalhos">
            {workItems.length === 0 ? (
              <EmptyState icon={Briefcase} title="Nenhum trabalho vinculado a este cliente" />
            ) : (
              <div className="flex flex-col gap-2">
                {workItems.map((w) => (
                  <Link
                    key={w.id}
                    href="/visionario/trabalhos"
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{w.title}</p>
                      {w.due_date && <p className="text-xs text-muted-foreground">Prazo: {formatDate(w.due_date)}</p>}
                    </div>
                    <StatusBadge status={w.status} className="shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {permissions.canViewSites && (
          <TabsContent value="sites">
            {sites.length === 0 ? (
              <EmptyState icon={Globe} title="Nenhum site cadastrado para este cliente" />
            ) : (
              <div className="flex flex-col gap-2">
                {sites.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{s.project_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.domain}
                        {s.due_date && ` · vence ${formatDate(s.due_date)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={s.status} />
                      {s.url && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                          <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir site">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {permissions.canViewVendedores && (
          <TabsContent value="vendas">
            {sales.length === 0 ? (
              <EmptyState title="Nenhuma venda registrada para este cliente" />
            ) : (
              <div className="flex flex-col gap-2">
                {sales.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{formatDate(s.sale_date)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={s.status === "confirmada" ? "ativo" : s.status === "cancelada" ? "cancelada" : "pendente"} />
                      <span className="text-sm font-medium">{formatCurrency(s.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        <TabsContent value="observacoes">
          <Card className="p-4">
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{client.notes || "Nenhuma observação registrada."}</p>
          </Card>
        </TabsContent>
      </Tabs>

      {permissions.canEditClient && (
        <ClientFormDialog open={editClientOpen} onOpenChange={setEditClientOpen} client={client} members={members} />
      )}
      {(permissions.canCreateContract || permissions.canEditContract) && (
        <ContractServiceDialog
          open={contractFormOpen}
          onOpenChange={setContractFormOpen}
          clientId={client.id}
          services={services}
          contract={editingContract}
          hasFinance={editingContract ? financeLinked.has(editingContract.id) : false}
        />
      )}
      {pendingAction && confirmCopy && (
        <AsyncConfirmDialog
          open
          onOpenChange={(open) => !open && setPendingAction(null)}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirmLabel}
          destructive={confirmCopy.destructive}
          onConfirm={() => runContractAction(pendingAction)}
        />
      )}
      {markingCharge && (
        <MarkPaymentDialog
          scope="visionario"
          charge={markingCharge}
          remaining={remainingAmount(markingCharge, payments)}
          accounts={accounts}
          onOpenChange={(open) => !open && setMarkingCharge(null)}
        />
      )}
    </div>
  );
}
