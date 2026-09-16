"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, MessageCircle, AtSign, Globe, Pencil, Plus, Trash2,
  Mail, Phone, FolderGit2, ExternalLink, Server,
} from "lucide-react";
import { useDbStore } from "@/store/db-store";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ClientFormDialog } from "@/components/forms/client-form-dialog";
import { ClientServiceFormDialog } from "@/components/forms/client-service-form-dialog";
import { ClientPaymentFormDialog } from "@/components/forms/client-payment-form-dialog";
import { ClientSiteFormDialog } from "@/components/forms/client-site-form-dialog";
import { clientMonthlyValue } from "@/lib/selectors";
import { formatCurrency, formatDate, formatMonthYear } from "@/lib/format";
import type { ClientService, ClientPayment } from "@/types/entities";
import { toast } from "sonner";

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { canAccessVisionario } = useAuth();

  const clients = useDbStore((s) => s.clients);
  const services = useDbStore((s) => s.services);
  const clientServices = useDbStore((s) => s.clientServices);
  const clientPayments = useDbStore((s) => s.clientPayments);
  const clientSites = useDbStore((s) => s.clientSites);
  const workItems = useDbStore((s) => s.workItems);
  const update = useDbStore((s) => s.update);
  const remove = useDbStore((s) => s.remove);

  const [editClientOpen, setEditClientOpen] = useState(false);
  const [csFormOpen, setCsFormOpen] = useState(false);
  const [editingCs, setEditingCs] = useState<ClientService | undefined>();
  const [deletingCs, setDeletingCs] = useState<ClientService | undefined>();
  const [payFormOpen, setPayFormOpen] = useState(false);
  const [editingPay, setEditingPay] = useState<ClientPayment | undefined>();
  const [deletingPay, setDeletingPay] = useState<ClientPayment | undefined>();
  const [siteFormOpen, setSiteFormOpen] = useState(false);

  const client = clients.find((c) => c.id === params.id);

  if (!canAccessVisionario) return null;
  if (!client) {
    return (
      <EmptyState
        title="Cliente não encontrado"
        action={<Button size="sm" onClick={() => router.push("/visionario/clientes")}>Voltar</Button>}
      />
    );
  }

  const links = clientServices.filter((cs) => cs.clientId === client.id);
  const payments = clientPayments
    .filter((p) => p.clientId === client.id)
    .sort((a, b) => (a.competencia < b.competencia ? 1 : -1));
  const site = clientSites.find((s) => s.clientId === client.id);
  const clientWorks = workItems.filter((w) => w.clientId === client.id);
  const monthlyValue = clientMonthlyValue({ clientServices }, client);

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" className="w-fit" onClick={() => router.push("/visionario/clientes")}>
        <ArrowLeft className="h-4 w-4" /> Voltar para clientes
      </Button>

      <PageHeader
        title={client.name}
        description={client.company}
        actions={
          <>
            <StatusBadge status={client.status} />
            <Button size="sm" variant="outline" onClick={() => setEditClientOpen(true)}>
              <Pencil className="h-4 w-4" /> Editar
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        {client.whatsapp && (
          <Button variant="outline" size="sm" asChild>
            <a href={`https://wa.me/${client.whatsapp}`} target="_blank" rel="noreferrer">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
          </Button>
        )}
        {client.instagram && (
          <Button variant="outline" size="sm" asChild>
            <a href={client.instagram} target="_blank" rel="noreferrer">
              <AtSign className="h-3.5 w-3.5" /> Instagram
            </a>
          </Button>
        )}
        {client.website && (
          <Button variant="outline" size="sm" asChild>
            <a href={client.website} target="_blank" rel="noreferrer">
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
        <TabsList>
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="servicos">Serviços</TabsTrigger>
          <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
          <TabsTrigger value="site">Site & Domínio</TabsTrigger>
          <TabsTrigger value="trabalhos">Trabalhos</TabsTrigger>
          <TabsTrigger value="observacoes">Observações</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Valor mensal</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{formatCurrency(monthlyValue)}</p>
              <p className="text-xs text-muted-foreground">
                {client.pricingMode === "pacote" ? "Pacote fechado" : `${links.length} serviço(s)`}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Cliente desde</p>
              <p className="mt-1 text-sm font-medium text-foreground">{formatDate(client.joinedAt)}</p>
              <p className="text-xs text-muted-foreground">Vencimento dia {client.dueDay}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Último pagamento</p>
              {payments[0] ? (
                <>
                  <p className="mt-1 text-sm font-medium text-foreground">{formatMonthYear(payments[0].competencia + "-01")}</p>
                  <StatusBadge status={payments[0].status} className="mt-1" />
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Sem histórico</p>
              )}
            </Card>
          </div>
          <Card className="mt-3 p-4">
            <p className="mb-2 text-sm font-medium text-foreground">Contato</p>
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              {client.phone && <p className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {client.phone}</p>}
              {client.email && <p className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {client.email}</p>}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="servicos">
          <div className="mb-2 flex justify-end">
            <Button size="sm" onClick={() => { setEditingCs(undefined); setCsFormOpen(true); }}>
              <Plus className="h-4 w-4" /> Adicionar serviço
            </Button>
          </div>
          {links.length === 0 ? (
            <EmptyState title="Nenhum serviço contratado" />
          ) : (
            <div className="flex flex-col gap-2">
              {links.map((cs) => {
                const svc = services.find((s) => s.id === cs.serviceId);
                return (
                  <div key={cs.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{svc?.name ?? "Serviço"}</p>
                      <p className="text-xs text-muted-foreground">{svc?.billingType}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{formatCurrency(cs.price)}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingCs(cs); setCsFormOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeletingCs(cs)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {client.pricingMode === "individual" && (
                <div className="flex items-center justify-between rounded-lg border-t-2 border-dashed border-border px-3 pt-3">
                  <span className="text-sm font-medium text-foreground">Total</span>
                  <span className="text-sm font-semibold text-primary">{formatCurrency(monthlyValue)}</span>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pagamentos">
          <div className="mb-2 flex justify-end">
            <Button size="sm" onClick={() => { setEditingPay(undefined); setPayFormOpen(true); }}>
              <Plus className="h-4 w-4" /> Novo pagamento
            </Button>
          </div>
          {payments.length === 0 ? (
            <EmptyState title="Nenhum pagamento registrado" />
          ) : (
            <div className="flex flex-col gap-2">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{formatMonthYear(p.competencia + "-01")}</p>
                    <p className="text-xs text-muted-foreground">
                      Vence {formatDate(p.dueDate)}
                      {p.paidDate && ` · pago em ${formatDate(p.paidDate)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{formatCurrency(p.amount)}</span>
                    <StatusBadge status={p.status} />
                    {p.status !== "pago" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          update("clientPayments", p.id, {
                            status: "pago",
                            paidDate: new Date().toISOString().slice(0, 10),
                            paymentMethod: p.paymentMethod ?? "Pix",
                          });
                          toast.success("Pagamento marcado como pago — refletido no financeiro da Visionário Dev.");
                        }}
                      >
                        Marcar pago
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingPay(p); setPayFormOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeletingPay(p)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="site">
          <div className="mb-2 flex justify-end">
            <Button size="sm" onClick={() => setSiteFormOpen(true)}>
              <Pencil className="h-4 w-4" /> {site ? "Editar" : "Cadastrar site"}
            </Button>
          </div>
          {!site ? (
            <EmptyState icon={Server} title="Nenhum site cadastrado para este cliente" />
          ) : (
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{site.siteName ?? site.domain}</p>
                  <p className="text-xs text-muted-foreground">{site.domain}</p>
                </div>
                <StatusBadge status={site.status} />
              </div>
              <Separator className="my-3" />
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Hospedagem</p>
                  <p className="text-foreground">
                    {site.hostingProvider === "Outra" ? site.hostingProviderOther : site.hostingProvider}
                    {site.hostingPlan && ` · ${site.hostingPlan}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {site.hostingBilling === "gratis" ? "Grátis" : `${formatCurrency(site.hostingPrice ?? 0)} / ${site.hostingBilling}`}
                    {site.hostingNextRenewal && ` · renova em ${formatDate(site.hostingNextRenewal)}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Domínio</p>
                  <p className="text-foreground">{site.domainRegistrar}</p>
                  <p className="text-xs text-muted-foreground">
                    {site.domainRenewalDate && `Renova em ${formatDate(site.domainRenewalDate)}`}
                    {site.domainRenewalPrice ? ` · ${formatCurrency(site.domainRenewalPrice)}` : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {site.url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={site.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Abrir site</a>
                  </Button>
                )}
                {site.githubRepo && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={site.githubRepo} target="_blank" rel="noreferrer"><FolderGit2 className="h-3.5 w-3.5" /> Repositório</a>
                  </Button>
                )}
              </div>
              {site.technicalNotes && (
                <p className="mt-3 text-xs text-muted-foreground">{site.technicalNotes}</p>
              )}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="trabalhos">
          {clientWorks.length === 0 ? (
            <EmptyState title="Nenhum trabalho relacionado a este cliente" />
          ) : (
            <div className="flex flex-col gap-2">
              {clientWorks.map((w) => (
                <div key={w.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{w.title}</p>
                    {w.dueDate && <p className="text-xs text-muted-foreground">Prazo {formatDate(w.dueDate)}</p>}
                  </div>
                  <StatusBadge status={w.status} />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="observacoes">
          <Card className="p-4">
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {client.notes || "Nenhuma observação registrada."}
            </p>
          </Card>
        </TabsContent>
      </Tabs>

      <ClientFormDialog open={editClientOpen} onOpenChange={setEditClientOpen} client={client} spaceId={client.spaceId} />
      <ClientServiceFormDialog
        open={csFormOpen}
        onOpenChange={setCsFormOpen}
        clientId={client.id}
        clientService={editingCs}
        services={services.filter((s) => s.status === "ativo")}
      />
      <ClientPaymentFormDialog
        open={payFormOpen}
        onOpenChange={setPayFormOpen}
        clientId={client.id}
        spaceId={client.spaceId}
        payment={editingPay}
        defaultAmount={monthlyValue}
      />
      <ClientSiteFormDialog open={siteFormOpen} onOpenChange={setSiteFormOpen} clientId={client.id} site={site} />

      <ConfirmDialog
        open={!!deletingCs}
        onOpenChange={(open) => !open && setDeletingCs(undefined)}
        title="Remover serviço do cliente?"
        onConfirm={() => deletingCs && remove("clientServices", deletingCs.id)}
      />
      <ConfirmDialog
        open={!!deletingPay}
        onOpenChange={(open) => !open && setDeletingPay(undefined)}
        title="Excluir pagamento?"
        onConfirm={() => deletingPay && remove("clientPayments", deletingPay.id)}
      />
    </div>
  );
}
