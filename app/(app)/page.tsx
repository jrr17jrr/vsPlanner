"use client";

import Link from "next/link";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Rocket,
  Video,
  ArrowRight,
  Briefcase,
  GraduationCap,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyCard } from "@/components/shared/money-card";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  personalFinanceSummary,
  visionarioFinanceSummary,
  daysUntil,
} from "@/lib/selectors";
import { getOccurrencesForDay, getOccurrences } from "@/lib/routine";
import { formatCurrency, formatDateLong, formatDate, toDateKey } from "@/lib/format";
import { StatusBadge } from "@/components/shared/status-badge";

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

  const upcomingBills = db.recurringExpenses
    .filter((e) => e.spaceId === personalSpace.id && e.active)
    .map((e) => ({ ...e, days: daysUntil(e.nextDueDate) }))
    .filter((e) => e.days !== null && e.days <= 10)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));

  const pendingClients = canAccessVisionario
    ? db.clients
        .filter((c) => c.status === "ativo")
        .map((c) => {
          const payment = db.clientPayments
            .filter((p) => p.clientId === c.id)
            .sort((a, b) => (a.competencia < b.competencia ? 1 : -1))[0];
          return { client: c, payment };
        })
        .filter((x) => x.payment && x.payment.status !== "pago")
        .slice(0, 4)
    : [];

  // Prioriza trabalhos atribuídos a mim — um trabalho só do sócio não é pendência minha.
  const upcomingWork = canAccessVisionario
    ? db.workItems
        .filter((w) => w.status !== "concluido" && w.dueDate && w.responsibleIds.includes(profile.id))
        .map((w) => ({ ...w, days: daysUntil(w.dueDate) }))
        .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
        .slice(0, 4)
    : [];

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

      {/* Financeiro resumido */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Meu Dinheiro</h2>
          <Link href="/financeiro" className="flex items-center gap-1 text-xs text-primary hover:underline">
            Ver detalhes <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MoneyCard label="Saldo atual" amount={pessoal.saldo} icon={Wallet} />
          <MoneyCard label="Entradas do mês" amount={pessoal.entradasMes} icon={TrendingUp} tone="success" />
          <MoneyCard label="Gastos do mês" amount={pessoal.saidasMes} icon={TrendingDown} tone="destructive" />
        </div>
      </section>

      {(visionario || tiktok) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {visionario && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">Visionário Dev</h2>
                <Link href="/visionario" className="flex items-center gap-1 text-xs text-primary hover:underline">
                  Ver detalhes <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <MoneyCard label="Faturamento" amount={visionario.faturamento} icon={Rocket} className="[&_p]:text-[11px]" />
                <MoneyCard label="Lucro" amount={visionario.lucro} tone="success" />
                <MoneyCard label="A receber" amount={visionario.aReceber} tone="warning" />
              </div>
            </section>
          )}

          {tiktok && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">TikTok</h2>
                <Link href="/tiktok" className="flex items-center gap-1 text-xs text-primary hover:underline">
                  Ver detalhes <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <MoneyCard label="Ganhos" amount={tiktok.entradasMes} icon={Video} />
                <MoneyCard label="Gastos" amount={tiktok.saidasMes} tone="destructive" />
                <MoneyCard
                  label="Lucro"
                  amount={tiktok.entradasMes - tiktok.saidasMes}
                  tone="success"
                />
              </div>
            </section>
          )}
        </div>
      )}

      {/* Progresso da semana */}
      <Card className="p-4">
        <p className="text-sm font-medium text-foreground">Progresso da semana</p>
        <p className="text-xs text-muted-foreground">
          {weekConcluidas} de {weekOccurrences.length} atividades concluídas
        </p>
        <Progress value={weekPct} className="mt-3" />
        <p className="mt-1.5 text-right text-xs font-medium text-primary">{weekPct}%</p>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Contas próximas do vencimento */}
        <Card className="p-4">
          <p className="text-sm font-medium text-foreground">Contas próximas do vencimento</p>
          <div className="mt-3 flex flex-col gap-2">
            {upcomingBills.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">Nenhuma conta vencendo em breve.</p>
            ) : (
              upcomingBills.map((b) => (
                <div key={b.id} className="flex items-center justify-between text-sm">
                  <span className="truncate text-foreground">{b.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{formatCurrency(b.amount)}</span>
                    <Badge variant={b.days! <= 3 ? "destructive" : "warning"}>{b.days}d</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Clientes com pagamento pendente */}
        {canAccessVisionario && (
          <Card className="p-4">
            <p className="text-sm font-medium text-foreground">Pagamentos pendentes</p>
            <div className="mt-3 flex flex-col gap-2">
              {pendingClients.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">Todos os clientes em dia.</p>
              ) : (
                pendingClients.map(({ client, payment }) => (
                  <Link
                    key={client.id}
                    href={`/visionario/clientes/${client.id}`}
                    className="flex items-center justify-between text-sm hover:text-primary"
                  >
                    <span className="truncate">{client.name}</span>
                    <StatusBadge status={payment!.status} />
                  </Link>
                ))
              )}
            </div>
          </Card>
        )}

        {/* Trabalhos próximos do prazo (atribuídos a mim) */}
        {canAccessVisionario && (
          <Card className="p-4">
            <p className="text-sm font-medium text-foreground">Meus trabalhos próximos do prazo</p>
            <div className="mt-3 flex flex-col gap-2">
              {upcomingWork.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">Nenhum prazo próximo.</p>
              ) : (
                upcomingWork.map((w) => (
                  <Link
                    key={w.id}
                    href="/visionario/trabalhos"
                    className="flex items-center justify-between text-sm hover:text-primary"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      {w.days !== null && w.days < 0 ? (
                        <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />
                      ) : (
                        <Briefcase className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      {w.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {w.dueDate && formatDate(w.dueDate)}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
