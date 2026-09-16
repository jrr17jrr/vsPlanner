"use client";

import Link from "next/link";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Rocket,
  Video,
  CheckCircle2,
  Clock,
  ArrowRight,
  Briefcase,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyCard } from "@/components/shared/money-card";
import { MetricCard } from "@/components/shared/metric-card";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  personalFinanceSummary,
  visionarioFinanceSummary,
  daysUntil,
} from "@/lib/selectors";
import { getOccurrencesForDay, getOccurrences } from "@/lib/routine";
import { formatCurrency, formatDateLong, formatDate } from "@/lib/format";
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
  const todayOccurrences = getOccurrencesForDay(
    db.activities.filter((a) => a.userId === profile.id),
    today
  );
  const concluidas = todayOccurrences.filter((o) => o.completed).length;
  const total = todayOccurrences.length;
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

  const pessoal = personalFinanceSummary(db, personalSpace.id);

  const visionarioSpace = db.spaces.find((s) => s.slug === "visionario-dev");
  const visionario = canAccessVisionario && visionarioSpace
    ? visionarioFinanceSummary(db, visionarioSpace.id)
    : null;

  const tiktokSpace = db.spaces.find((s) => s.slug === "tiktok");
  const tiktok = canAccessTiktok && tiktokSpace
    ? personalFinanceSummary(db, tiktokSpace.id)
    : null;

  const myTasks = db.tasks
    .filter((t) => t.responsibleId === profile.id && t.status !== "concluida")
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .slice(0, 5);

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

  const upcomingWork = canAccessVisionario
    ? db.workItems
        .filter((w) => w.status !== "concluido" && w.dueDate)
        .map((w) => ({ ...w, days: daysUntil(w.dueDate) }))
        .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
        .slice(0, 4)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${greeting()}, ${profile.name.split(" ")[0]}.`}
        description={formatDateLong(today)}
      />

      {/* Hoje */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Hoje</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Concluídas" value={concluidas} icon={CheckCircle2} tone="success" />
          <MetricCard label="Total de atividades" value={total} icon={Clock} />
          <MetricCard label="Progresso" value={`${pct}%`} icon={TrendingUp} />
          <Card className="col-span-2 p-4 sm:col-span-1">
            <p className="text-xs font-medium text-muted-foreground">Próxima atividade</p>
            {proxima ? (
              <>
                <p className="mt-2 truncate text-sm font-semibold text-foreground">
                  {proxima.activity.title}
                </p>
                <p className="text-xs text-muted-foreground">{proxima.activity.startTime}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Tudo concluído 🎉</p>
            )}
          </Card>
        </div>
      </section>

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Progresso semanal */}
        <Card className="p-4">
          <p className="text-sm font-medium text-foreground">Progresso semanal</p>
          <p className="text-xs text-muted-foreground">
            {weekConcluidas} de {weekOccurrences.length} atividades concluídas
          </p>
          <Progress value={weekPct} className="mt-3" />
          <p className="mt-1.5 text-right text-xs font-medium text-primary">{weekPct}%</p>
        </Card>

        {/* Tarefas importantes */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Tarefas importantes</p>
            <Link href="/tarefas" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Ver todas <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {myTasks.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma tarefa pendente.</p>
            ) : (
              myTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={t.status === "concluida"} disabled />
                  <span className="flex-1 truncate text-foreground">{t.title}</span>
                  {t.dueDate && (
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(t.dueDate)}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

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

        {/* Trabalhos próximos do prazo */}
        {canAccessVisionario && (
          <Card className="p-4">
            <p className="text-sm font-medium text-foreground">Trabalhos próximos do prazo</p>
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
