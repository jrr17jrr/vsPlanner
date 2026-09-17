"use client";

import Link from "next/link";
import {
  Rocket,
  Video,
  ArrowRight,
  Briefcase,
  GraduationCap,
  Wallet,
  Globe,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  personalFinanceSummary,
  visionarioFinanceSummary,
  daysUntil,
} from "@/lib/selectors";
import { getOccurrencesForDay, getOccurrences } from "@/lib/routine";
import { formatCurrency, formatDateLong, toDateKey } from "@/lib/format";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export default function DashboardPage() {
  const { profile, personalSpace, canAccessVisionario, canAccessTiktok } = useAuth();
  const db = useDbStore((s) => s);

  if (!profile || !personalSpace) return null;

  const today = new Date();
  const todayKey = toDateKey(today);
  const todayOccurrences = getOccurrencesForDay(
    db.activities.filter((a) => a.userId === profile.id),
    today
  );
  const todayTasks = db.tasks.filter((t) => t.userId === profile.id && t.dueDate === todayKey);
  const todayWorkTasks = db.workTasks.filter((t) => t.userId === profile.id && t.dueDate === todayKey);

  const total = todayOccurrences.length + todayTasks.length + todayWorkTasks.length;
  const concluidas =
    todayOccurrences.filter((o) => o.completed).length +
    todayTasks.filter((t) => t.status === "concluida").length +
    todayWorkTasks.filter((t) => t.status === "concluida").length;
  const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0;
  const proxima = todayOccurrences.find((o) => !o.completed);

  const monday = new Date(today);
  const day = monday.getDay();
  monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const weekOccurrences = getOccurrences(
    db.activities.filter((a) => a.userId === profile.id),
    monday,
    sunday
  );
  const weekConcluidas = weekOccurrences.filter((o) => o.completed).length;
  const weekPct = weekOccurrences.length > 0 ? Math.round((weekConcluidas / weekOccurrences.length) * 100) : 0;

  // Pendências por área (para priorizar rapidamente)
  const pendenciasTrabalho = todayWorkTasks.filter((t) => t.status !== "concluida").length;
  const pendenciasVisionario = canAccessVisionario
    ? db.workItems.filter((w) => w.responsibleIds.includes(profile.id) && w.status !== "concluido").length
    : 0;
  const pendenciasTiktok = canAccessTiktok
    ? todayOccurrences.filter((o) => o.activity.category === "TikTok" && !o.completed).length
    : 0;
  const pendenciasEstudos =
    todayOccurrences.filter(
      (o) => ["Faculdade", "Alura", "Curso"].includes(o.activity.category) && !o.completed
    ).length + todayTasks.filter((t) => t.category === "Faculdade" && t.status !== "concluida").length;

  const pessoal = personalFinanceSummary(db, personalSpace.id);

  const visionarioSpace = db.spaces.find((s) => s.slug === "visionario-dev");
  const visionario = canAccessVisionario && visionarioSpace
    ? visionarioFinanceSummary(db, visionarioSpace.id)
    : null;

  const tiktokSpace = db.spaces.find((s) => s.slug === "tiktok");
  const tiktok = canAccessTiktok && tiktokSpace
    ? personalFinanceSummary(db, tiktokSpace.id)
    : null;

  // ---------------------------------------------------------------------
  // Precisa da sua atenção — lista única combinando as fontes existentes
  // ---------------------------------------------------------------------
  interface AttentionItem {
    id: string;
    icon: LucideIcon;
    label: string;
    title: string;
    meta: string;
    urgent: boolean;
    days: number;
    href: string;
  }
  const attentionItems: AttentionItem[] = [];

  db.recurringExpenses
    .filter((e) => e.spaceId === personalSpace.id && e.active)
    .forEach((e) => {
      const days = daysUntil(e.nextDueDate);
      if (days === null || days > 10) return;
      attentionItems.push({
        id: e.id,
        icon: Wallet,
        label: "Conta próxima do vencimento",
        title: `${e.name} — ${formatCurrency(e.amount)}`,
        meta: days < 0 ? "atrasada" : days === 0 ? "vence hoje" : `vence em ${days}d`,
        urgent: days <= 3,
        days,
        href: "/financeiro",
      });
    });

  if (canAccessVisionario) {
    db.clients
      .filter((c) => c.status === "ativo")
      .forEach((c) => {
        const payment = db.clientPayments
          .filter((p) => p.clientId === c.id)
          .sort((a, b) => (a.competencia < b.competencia ? 1 : -1))[0];
        if (!payment || payment.status === "pago") return;
        attentionItems.push({
          id: payment.id,
          icon: Wallet,
          label: "Pagamento pendente",
          title: `${c.name} — ${formatCurrency(payment.amount)}`,
          meta: payment.status === "atrasado" ? "atrasado" : "pendente",
          urgent: payment.status === "atrasado",
          days: payment.status === "atrasado" ? -1 : 5,
          href: `/visionario/clientes/${c.id}`,
        });
      });

    // Prioriza trabalhos atribuídos a mim — um trabalho só do sócio não é pendência minha.
    db.workItems
      .filter((w) => w.status !== "concluido" && w.dueDate && w.responsibleIds.includes(profile.id))
      .forEach((w) => {
        const days = daysUntil(w.dueDate);
        if (days === null) return;
        attentionItems.push({
          id: w.id,
          icon: Briefcase,
          label: "Trabalho próximo do prazo",
          title: w.title,
          meta: days < 0 ? "atrasado" : days === 0 ? "hoje" : days === 1 ? "amanhã" : `em ${days}d`,
          urgent: days < 0,
          days,
          href: "/visionario/trabalhos",
        });
      });

    db.clientSites
      .forEach((site) => {
        const days = daysUntil(site.domainRenewalDate);
        if (days === null || days > 30) return;
        attentionItems.push({
          id: site.id,
          icon: Globe,
          label: "Domínio próximo da renovação",
          title: site.domain ?? site.siteName ?? "Domínio",
          meta: days < 0 ? "vencido" : `vence em ${days}d`,
          urgent: days <= 7,
          days,
          href: "/visionario/sites",
        });
      });
  }

  attentionItems.sort((a, b) => a.days - b.days);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${greeting()}, ${profile.name.split(" ")[0]}`}
        description={formatDateLong(today)}
      />

      {/* Meu Dia */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Meu dia</p>
          <span className="text-sm font-semibold text-primary">
            {concluidas}/{total} · {pct}%
          </span>
        </div>
        <Progress value={pct} className="mt-2" />

        {proxima && (
          <div className="mt-3 flex items-center justify-between rounded-md bg-secondary/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Próximo</span>
            <span className="font-medium text-foreground">
              {proxima.activity.startTime} — {proxima.activity.title}
            </span>
          </div>
        )}

        {(pendenciasTrabalho > 0 || pendenciasVisionario > 0 || pendenciasTiktok > 0 || pendenciasEstudos > 0) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {pendenciasTrabalho > 0 && (
              <span className="flex items-center gap-1 rounded-md bg-secondary/40 px-2 py-1">
                <Briefcase className="h-3 w-3" /> Trabalho <b className="text-foreground">{pendenciasTrabalho}</b>
              </span>
            )}
            {pendenciasVisionario > 0 && (
              <span className="flex items-center gap-1 rounded-md bg-secondary/40 px-2 py-1">
                <Rocket className="h-3 w-3" /> Visionário <b className="text-foreground">{pendenciasVisionario}</b>
              </span>
            )}
            {pendenciasTiktok > 0 && (
              <span className="flex items-center gap-1 rounded-md bg-secondary/40 px-2 py-1">
                <Video className="h-3 w-3" /> TikTok <b className="text-foreground">{pendenciasTiktok}</b>
              </span>
            )}
            {pendenciasEstudos > 0 && (
              <span className="flex items-center gap-1 rounded-md bg-secondary/40 px-2 py-1">
                <GraduationCap className="h-3 w-3" /> Estudos <b className="text-foreground">{pendenciasEstudos}</b>
              </span>
            )}
          </div>
        )}

        <Button asChild size="sm" className="mt-3 w-full sm:w-auto">
          <Link href="/hoje">Ver meu dia <ArrowRight className="h-3.5 w-3.5" /></Link>
        </Button>
      </Card>

      {/* Resumo financeiro */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Resumo financeiro</h2>
        <Card className="p-4">
          <div className="grid grid-cols-1 gap-4 divide-y divide-border sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
            <FinanceColumn
              title="Pessoal"
              icon={Wallet}
              rows={[
                { label: "Saldo atual", value: pessoal.saldo },
                { label: "Entradas", value: pessoal.entradasMes, tone: "success" },
                { label: "Gastos", value: pessoal.saidasMes, tone: "destructive" },
              ]}
              href="/financeiro"
              linkLabel="Ver meu dinheiro"
            />
            {visionario && (
              <FinanceColumn
                title="Visionário Dev"
                icon={Rocket}
                rows={[
                  { label: "Recebido", value: visionario.recebido, tone: "success" },
                  { label: "A receber", value: visionario.aReceber, tone: "warning" },
                  { label: "Lucro", value: visionario.lucro, tone: visionario.lucro >= 0 ? "success" : "destructive" },
                ]}
                href="/visionario/financeiro"
                linkLabel="Ver financeiro"
              />
            )}
            {tiktok && (
              <FinanceColumn
                title="TikTok"
                icon={Video}
                rows={[
                  { label: "Ganhos", value: tiktok.entradasMes },
                  { label: "Gastos", value: tiktok.saidasMes, tone: "destructive" },
                  { label: "Lucro", value: tiktok.entradasMes - tiktok.saidasMes, tone: "success" },
                ]}
                href="/tiktok/financeiro"
                linkLabel="Ver financeiro"
              />
            )}
          </div>
        </Card>
      </section>

      {/* Progresso da semana */}
      <Card className="p-4">
        <p className="text-sm font-medium text-foreground">Progresso da semana</p>
        <p className="text-xs text-muted-foreground">
          {weekConcluidas} de {weekOccurrences.length} atividades concluídas
        </p>
        <Progress value={weekPct} className="mt-3" />
        <p className="mt-1.5 text-right text-xs font-medium text-primary">{weekPct}%</p>
      </Card>

      {/* Precisa da sua atenção */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Precisa da sua atenção</h2>
        <Card className="p-2">
          {attentionItems.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">Tudo em dia por aqui.</p>
          ) : (
            <div className="flex flex-col">
              {attentionItems.slice(0, 8).map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-secondary/50"
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                      item.urgent ? "bg-destructive/15 text-destructive" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-muted-foreground">{item.label}</p>
                    <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-medium ${
                      item.urgent ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {item.meta}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function FinanceColumn({
  title,
  icon: Icon,
  rows,
  href,
  linkLabel,
}: {
  title: string;
  icon: LucideIcon;
  rows: { label: string; value: number; tone?: "success" | "destructive" | "warning" }[];
  href: string;
  linkLabel: string;
}) {
  const toneClass: Record<string, string> = {
    success: "text-success",
    destructive: "text-destructive",
    warning: "text-warning",
  };
  return (
    <div className="flex flex-col gap-2 pt-4 first:pt-0 sm:pt-0 sm:px-4 sm:first:pl-0 sm:last:pr-0">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">{row.label}</span>
            <span
              className={`text-sm font-semibold tabular-nums whitespace-nowrap ${row.tone ? toneClass[row.tone] : "text-foreground"}`}
            >
              {formatCurrency(row.value)}
            </span>
          </div>
        ))}
      </div>
      <Link href={href} className="flex items-center gap-1 text-xs text-primary hover:underline">
        {linkLabel} <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
