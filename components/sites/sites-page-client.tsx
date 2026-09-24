"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Globe, ExternalLink, AlertTriangle, Plus, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmActionButton } from "@/components/shared/confirm-action-button";
import { ClientSiteFormDialog } from "@/components/sites/client-site-form-dialog";
import { deleteClientSiteAction } from "@/lib/supabase/sites-actions";
import { classifyDueDate } from "@/lib/due-date";
import { formatCurrency, formatDate, toDateKey } from "@/lib/format";
import type { Client, ClientSite, ClientSiteStatus } from "@/types/database.types";

export function SitesPageClient({
  sites,
  clients,
  permissions,
}: {
  sites: ClientSite[];
  clients: Client[];
  permissions: { canCreate: boolean; canEdit: boolean; canDelete: boolean };
}) {
  const [statusFilter, setStatusFilter] = useState<"todos" | ClientSiteStatus>("todos");
  const [onlyExpiring, setOnlyExpiring] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientSite | undefined>();

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  // Calculado uma vez (nunca `new Date()`/`Date.now()` direto no corpo do
  // componente) — data de hoje e os cortes de "vencendo em breve".
  const { today, in30, in45 } = useMemo(() => {
    const now = new Date();
    const plus = (days: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      return toDateKey(d);
    };
    return { today: toDateKey(now), in30: plus(30), in45: plus(45) };
  }, []);

  const ativos = sites.filter((s) => s.status === "ativo").length;
  const inativos = sites.length - ativos;
  const expiringSoon = sites.filter((s) => {
    const bucket = classifyDueDate(s.due_date, false, today);
    return bucket === "vence_hoje" || bucket === "atrasado" || (!!s.due_date && bucket === "proximo" && s.due_date <= in30);
  }).length;

  const filtered = sites.filter((site) => {
    if (statusFilter !== "todos" && site.status !== statusFilter) return false;
    if (onlyExpiring) {
      const bucket = classifyDueDate(site.due_date, false, today);
      const soon = !!site.due_date && site.due_date <= in30;
      if (bucket !== "atrasado" && !(bucket === "proximo" && soon) && bucket !== "vence_hoje") return false;
    }
    return true;
  });

  const upcoming = sites
    .filter((s) => s.due_date)
    .map((s) => ({ site: s, bucket: classifyDueDate(s.due_date, false, today) }))
    .filter((x) => x.bucket === "atrasado" || x.bucket === "vence_hoje" || x.site.due_date! <= in45)
    .sort((a, b) => (a.site.due_date ?? "").localeCompare(b.site.due_date ?? ""));

  async function handleDelete(id: string) {
    return deleteClientSiteAction(id);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sites"
        description="Sites e projetos web dos clientes. Domínios próprios ficam em Domínios."
        actions={
          permissions.canCreate ? (
            <Button size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
              <Plus className="h-4 w-4" /> Novo site
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Sites ativos" value={ativos} icon={Globe} />
        <MetricCard label="Sites inativos" value={inativos} />
        <MetricCard label="Total cadastrado" value={sites.length} />
        <MetricCard label="Vencendo em 30 dias" value={expiringSoon} tone="warning" />
      </div>

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Próximos vencimentos</h2>
          <div className="flex flex-col gap-2">
            {upcoming.map(({ site, bucket }) => (
              <div key={site.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  {bucket === "atrasado" && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {site.project_name} {clientById.get(site.client_id ?? "") && `· ${clientById.get(site.client_id ?? "")?.name}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(site.due_date!)}{site.price ? ` · ${formatCurrency(site.price)}` : ""}
                    </p>
                  </div>
                </div>
                <StatusBadge status={bucket === "atrasado" ? "atrasado" : "pendente"} />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo status</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="desenvolvimento">Em desenvolvimento</SelectItem>
            <SelectItem value="aguardando_cliente">Aguardando cliente</SelectItem>
            <SelectItem value="vencendo">Vencendo</SelectItem>
            <SelectItem value="expirado">Expirado</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant={onlyExpiring ? "default" : "outline"} onClick={() => setOnlyExpiring((v) => !v)}>
          Vencendo em breve
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Globe} title="Nenhum site encontrado" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((site) => {
            const client = site.client_id ? clientById.get(site.client_id) : undefined;
            return (
              <Card key={site.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{site.project_name}</p>
                    {site.domain && <p className="truncate text-xs text-muted-foreground">{site.domain}</p>}
                  </div>
                  <StatusBadge status={site.status} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {site.hosting_provider}
                  {site.due_date && ` · Vencimento: ${formatDate(site.due_date)}`}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {client && (
                    <Button variant="outline" size="sm" className="flex-1" asChild>
                      <Link href={`/visionario/clientes/${client.id}`}>Ver cliente</Link>
                    </Button>
                  )}
                  {site.url && (
                    <Button variant="secondary" size="sm" className="flex-1" asChild>
                      <a href={site.url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" /> Abrir site
                      </a>
                    </Button>
                  )}
                  {permissions.canEdit && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(site); setFormOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {permissions.canDelete && (
                    <ConfirmActionButton
                      label={<Trash2 className="h-3.5 w-3.5" />}
                      title="Excluir este site?"
                      description="Não pode ser desfeito."
                      confirmLabel="Excluir"
                      variant="ghost"
                      size="icon"
                      onConfirm={() => handleDelete(site.id)}
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {(permissions.canCreate || permissions.canEdit) && (
        <ClientSiteFormDialog open={formOpen} onOpenChange={setFormOpen} site={editing} clients={clients} />
      )}
    </div>
  );
}
