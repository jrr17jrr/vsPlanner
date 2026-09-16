"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Globe, ExternalLink, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { daysUntil } from "@/lib/selectors";
import { formatCurrency, formatDate } from "@/lib/format";

export default function SitesDominiosPage() {
  const { mySpaces } = useAuth();
  const clients = useDbStore((s) => s.clients);
  const clientSites = useDbStore((s) => s.clientSites);

  const [hostingFilter, setHostingFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [onlyExpiring, setOnlyExpiring] = useState(false);

  const visionarioSpace = mySpaces.find((s) => s.slug === "visionario-dev");

  const sites = useMemo(() => {
    if (!visionarioSpace) return [];
    return clientSites
      .map((site) => ({ site, client: clients.find((c) => c.id === site.clientId) }))
      .filter((x) => x.client?.spaceId === visionarioSpace.id);
  }, [clientSites, clients, visionarioSpace]);

  if (!visionarioSpace) return null;

  const online = sites.filter((s) => s.site.status === "online").length;
  const offline = sites.filter((s) => s.site.status !== "online").length;
  const domainsExpiringSoon = sites.filter((s) => {
    const days = daysUntil(s.site.domainRenewalDate);
    return days !== null && days <= 30;
  }).length;

  const filtered = sites.filter(({ site }) => {
    if (hostingFilter !== "todos" && site.hostingProvider !== hostingFilter) return false;
    if (statusFilter !== "todos" && site.status !== statusFilter) return false;
    if (onlyExpiring) {
      const domainDays = daysUntil(site.domainRenewalDate);
      const hostingDays = daysUntil(site.hostingNextRenewal);
      const expiring = (domainDays !== null && domainDays <= 30) || (hostingDays !== null && hostingDays <= 30);
      if (!expiring) return false;
    }
    return true;
  });

  const upcoming = sites
    .flatMap(({ site, client }) => {
      const items = [];
      const domainDays = daysUntil(site.domainRenewalDate);
      if (domainDays !== null && domainDays <= 45) {
        items.push({ type: "Domínio", client: client?.name, date: site.domainRenewalDate!, days: domainDays, price: site.domainRenewalPrice });
      }
      const hostingDays = daysUntil(site.hostingNextRenewal);
      if (hostingDays !== null && hostingDays <= 45) {
        items.push({ type: "Hospedagem", client: client?.name, date: site.hostingNextRenewal!, days: hostingDays, price: site.hostingPrice });
      }
      return items;
    })
    .sort((a, b) => a.days - b.days);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Sites & Domínios" description="Infraestrutura web de todos os clientes." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Sites ativos" value={online} icon={Globe} />
        <MetricCard label="Sites inativos" value={offline} />
        <MetricCard label="Domínios cadastrados" value={sites.length} />
        <MetricCard label="Vencendo em 30 dias" value={domainsExpiringSoon} tone="warning" />
      </div>

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Próximos vencimentos</h2>
          <div className="flex flex-col gap-2">
            {upcoming.map((u, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  {u.days < 7 && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                  <div>
                    <p className="text-sm font-medium text-foreground">{u.type} · {u.client}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(u.date)}{u.price ? ` · ${formatCurrency(u.price)}` : ""}</p>
                  </div>
                </div>
                <StatusBadge status={u.days < 7 ? "atrasado" : "pendente"} />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={hostingFilter} onValueChange={setHostingFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Toda hospedagem</SelectItem>
            <SelectItem value="Vercel">Vercel</SelectItem>
            <SelectItem value="Hostinger">Hostinger</SelectItem>
            <SelectItem value="Outra">Outra</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo status</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
            <SelectItem value="em_desenvolvimento">Em desenvolvimento</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={onlyExpiring ? "default" : "outline"}
          onClick={() => setOnlyExpiring((v) => !v)}
        >
          Vencendo em breve
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Globe} title="Nenhum site encontrado" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(({ site, client }) => (
            <Card key={site.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{site.siteName ?? site.domain}</p>
                  <p className="truncate text-xs text-muted-foreground">{site.domain}</p>
                </div>
                <StatusBadge status={site.status} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {site.hostingProvider === "Outra" ? site.hostingProviderOther : site.hostingProvider}
                {site.domainRenewalDate && ` · Renovação: ${formatDate(site.domainRenewalDate)}`}
              </p>
              <div className="mt-3 flex gap-2">
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
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
