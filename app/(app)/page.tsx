import Link from "next/link";
import { Rocket, Video, ArrowRight, Briefcase, CalendarClock, Wallet, HandCoins, ListChecks } from "lucide-react";
import { requireActiveProfile, findOrBootstrapSpace, requirePersonalSpace } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import { getTodayMeetingsForHoje } from "@/lib/supabase/meetings-actions";
import { getTodayWorkItemsForHoje } from "@/lib/supabase/work-items-actions";
import { loadMyDayTasks } from "@/lib/supabase/my-day";
import { getImportantAttentionTasks } from "@/lib/tasks";
import { loadSection, type SectionError as SectionErrorData, type SectionResult } from "@/lib/supabase/section-result";
import { SectionError } from "@/components/shared/section-error";
import { listWorkItems } from "@/lib/supabase/repositories/work-items.repository";
import {
  listFinancialCharges,
  listFinancialPayments,
  listFinancialAccounts,
} from "@/lib/supabase/repositories/financial.repository";
import { financialMonthOverview, type FinancialMonthOverview } from "@/lib/financial-calc";
import { prepareFinancialSpace } from "@/lib/supabase/financial-page-data";
import { VISIONARIO_DEV_SLUG, TIKTOK_SLUG } from "@/lib/space-slugs";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDateLong, todayKeySaoPaulo } from "@/lib/format";
import type { Space, WorkItem } from "@/types/database.types";

function greeting(): string {
  // Hora de São Paulo (o servidor pode estar em UTC).
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }).format(new Date())) % 24;
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Resumo financeiro de um espaço na Home — EXATAMENTE o mesmo cálculo da
 * página Financeiro daquele espaço (`financialMonthOverview`), depois de
 * materializar as recorrências do mesmo jeito que o Financeiro faz.
 * "Entrou/Saiu no mês" = caixa pela data real; nunca competência.
 */
async function loadFinanceColumn(space: Space, profileId: string): Promise<FinancialMonthOverview | null> {
  const allowed = await hasModulePermission(space.id, "financeiro", "view");
  if (!allowed) return null;

  await prepareFinancialSpace(space, profileId);
  const [charges, payments, accounts] = await Promise.all([
    listFinancialCharges(space.id),
    listFinancialPayments(space.id),
    listFinancialAccounts(space.id),
  ]);
  return financialMonthOverview(accounts, charges, payments);
}

/** Trabalhos (Visionário Dev) atrasados — só se o usuário puder ver o módulo. */
async function loadOverdueWorkItems(visionarioSpace: Space | null | undefined): Promise<WorkItem[]> {
  if (!visionarioSpace) return [];
  const canViewTrabalhos = await hasModulePermission(visionarioSpace.id, "trabalhos", "view");
  if (!canViewTrabalhos) return [];
  const todayKey = todayKeySaoPaulo();
  const workItems = await listWorkItems(visionarioSpace.id);
  return workItems.filter((w) => w.status !== "concluido" && w.due_date && w.due_date < todayKey);
}

/**
 * Dashboard raiz — 100% real, montado só com os espaços aos quais o
 * usuário tem acesso e só com os dados cujo módulo ele tem permissão de
 * ver. Tarefas pessoais vêm de `loadMyDayTasks` — a MESMA fonte do Meu
 * Dia (/hoje); "Precisa da sua atenção" mostra só as IMPORTANTES
 * relevantes hoje (regra em `getImportantAttentionTasks`).
 *
 * Cada seção (tarefas, reuniões, trabalhos, financeiro de cada espaço)
 * carrega de forma independente via `loadSection`: se uma query falhar, o
 * erro REAL (code/message/details/hint) é logado no terminal e mostrado na
 * própria seção, e o resto do Dashboard continua funcionando. Falha de
 * sessão/space ainda vai pro `error.tsx`.
 */
export default async function DashboardPage() {
  const { profile } = await requireActiveProfile();
  const { space: personalSpace } = await requirePersonalSpace();

  const [visionarioSpace, tiktokSpace] = await Promise.all([
    findOrBootstrapSpace(VISIONARIO_DEV_SLUG, profile),
    findOrBootstrapSpace(TIKTOK_SLUG, profile),
  ]);

  const noFinance: SectionResult<FinancialMonthOverview | null> = { ok: true, data: null };
  const [myDayResult, meetingsSection, workItemsSection, pessoalFinance, visionarioFinance, tiktokFinance, overdueWorkSection] =
    await Promise.all([
      loadSection("inicio:tarefas", () => loadMyDayTasks()),
      loadSection("inicio:reunioes", () => getTodayMeetingsForHoje()),
      loadSection("inicio:trabalhos", () => getTodayWorkItemsForHoje()),
      loadSection("inicio:financeiro-pessoal", () => loadFinanceColumn(personalSpace, profile.id)),
      visionarioSpace
        ? loadSection("inicio:financeiro-visionario", () => loadFinanceColumn(visionarioSpace, profile.id))
        : Promise.resolve(noFinance),
      tiktokSpace ? loadSection("inicio:financeiro-tiktok", () => loadFinanceColumn(tiktokSpace, profile.id)) : Promise.resolve(noFinance),
      loadSection("inicio:trabalhos-atrasados", () => loadOverdueWorkItems(visionarioSpace)),
    ]);

  const myDay = myDayResult.ok ? myDayResult.data : null;
  const meetingsResult = meetingsSection.ok ? meetingsSection.data : { meetings: [] };
  const workItemsResult = workItemsSection.ok ? workItemsSection.data : { workItems: [] };
  const sectionErrors: { title: string; error: SectionErrorData }[] = [];
  if (!myDayResult.ok) sectionErrors.push({ title: "Não foi possível carregar as tarefas", error: myDayResult.error });
  if (!meetingsSection.ok) sectionErrors.push({ title: "Não foi possível carregar as reuniões de hoje", error: meetingsSection.error });
  if (!workItemsSection.ok) sectionErrors.push({ title: "Não foi possível carregar os trabalhos de hoje", error: workItemsSection.error });
  if (!overdueWorkSection.ok) sectionErrors.push({ title: "Não foi possível carregar os trabalhos atrasados", error: overdueWorkSection.error });

  type AttentionItem = {
    id: string;
    icon: typeof Briefcase;
    label: string;
    title: string;
    meta: string;
    detail?: string | null;
    urgent: boolean;
    href: string;
  };
  const attentionItems: AttentionItem[] = [];

  if (myDay) {
    getImportantAttentionTasks(myDay).forEach((t) => {
      attentionItems.push({ ...t, icon: ListChecks, href: "/hoje" });
    });
  }

  if (overdueWorkSection.ok) {
    overdueWorkSection.data.forEach((w) => {
      attentionItems.push({
        id: w.id,
        icon: Briefcase,
        label: "Trabalho atrasado",
        title: w.title,
        meta: "atrasado",
        urgent: true,
        href: "/visionario/trabalhos",
      });
    });
  }

  meetingsResult.meetings.forEach((m) => {
    attentionItems.push({
      id: m.id,
      icon: CalendarClock,
      label: "Reunião hoje",
      title: m.title,
      meta: m.start_time.slice(0, 5),
      urgent: false,
      href: `/visionario/reunioes/${m.id}`,
    });
  });

  const financeBySpace = [
    { name: "Pessoal", space: personalSpace, href: "/financeiro", data: pessoalFinance },
    { name: "Visionário Dev", space: visionarioSpace, href: "/visionario/financeiro", data: visionarioFinance },
    { name: "TikTok", space: tiktokSpace, href: "/tiktok/financeiro", data: tiktokFinance },
  ];
  for (const { name, space, href, data: result } of financeBySpace) {
    const data = result.ok ? result.data : null;
    if (!space || !data) continue;
    if (data.aPagar.overdueCount > 0) {
      const n = data.aPagar.overdueCount;
      attentionItems.unshift({
        id: `${space.id}-pagar`,
        icon: Wallet,
        label: `${name} · ${n === 1 ? "pagamento atrasado" : "pagamentos atrasados"}`,
        title: `${n} ${n === 1 ? "pagamento atrasado" : "pagamentos atrasados"} — ${formatCurrency(data.aPagar.overdue)}`,
        meta: "atrasado",
        urgent: true,
        href: `${href}?aba=a_pagar`,
      });
    }
    if (data.aReceber.overdueCount > 0) {
      const n = data.aReceber.overdueCount;
      attentionItems.unshift({
        id: `${space.id}-receber`,
        icon: HandCoins,
        label: `${name} · ${n === 1 ? "cobrança atrasada" : "cobranças atrasadas"}`,
        title: `${n} ${n === 1 ? "cobrança atrasada" : "cobranças atrasadas"} — ${formatCurrency(data.aReceber.overdue)}`,
        meta: "atrasado",
        urgent: true,
        href: `${href}?aba=a_receber`,
      });
    }
  }
  attentionItems.sort((a, b) => Number(b.urgent) - Number(a.urgent));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`${greeting()}, ${profile.name.split(" ")[0]}`} description={formatDateLong(new Date())} />

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Meu dia</p>
          <span className="text-xs text-muted-foreground">
            {myDay ? `${myDay.today.length} tarefa(s) · ` : ""}
            {meetingsResult.meetings.length} reunião(ões) · {workItemsResult.workItems.length} trabalho(s)
          </span>
        </div>
        {sectionErrors.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {sectionErrors.map((s) => (
              <SectionError key={s.error.section} title={s.title} error={s.error} />
            ))}
          </div>
        )}
        <Link href="/hoje" className="mt-3 flex items-center gap-1 text-sm text-primary hover:underline">
          Ver meu dia <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Resumo financeiro</h2>
        <Card className="p-4">
          <div className="grid grid-cols-1 gap-4 divide-y divide-border sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
            <FinanceColumn title="Pessoal" icon={Wallet} result={pessoalFinance} href="/financeiro" />
            {visionarioSpace && <FinanceColumn title="Visionário Dev" icon={Rocket} result={visionarioFinance} href="/visionario/financeiro" />}
            {tiktokSpace && <FinanceColumn title="TikTok" icon={Video} result={tiktokFinance} href="/tiktok/financeiro" />}
          </div>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Precisa da sua atenção</h2>
        <Card className="p-2">
          {attentionItems.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              {sectionErrors.length > 0 ? "Algumas seções não carregaram — veja o erro em “Meu dia”." : "Tudo em dia por aqui."}
            </p>
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
                    {item.detail && <p className="truncate text-[11px] text-muted-foreground">{item.detail}</p>}
                  </div>
                  <span className={`shrink-0 text-xs font-medium ${item.urgent ? "text-destructive" : "text-muted-foreground"}`}>
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
  result,
  href,
}: {
  title: string;
  icon: typeof Wallet;
  /** `data: null` = sem permissão para ver o financeiro do espaço. */
  result: SectionResult<FinancialMonthOverview | null>;
  href: string;
}) {
  const data = result.ok ? result.data : null;
  return (
    <div className="flex flex-col gap-2 pt-4 first:pt-0 sm:pt-0 sm:px-4 sm:first:pl-0 sm:last:pr-0">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      </div>
      {!result.ok ? (
        <SectionError title="Não foi possível carregar o financeiro" error={result.error} />
      ) : data ? (
        <div className="flex flex-col gap-1">
          <Row label="Saldo atual" value={data.saldo} />
          <div className="my-1 border-t border-border/60" />
          <Row label="Entrou no mês" value={data.recebido} tone="success" />
          <Row label="Saiu no mês" value={data.pago} tone="destructive" />
          <div className="my-1 border-t border-border/60" />
          <Row
            label="A receber"
            value={data.aReceber.total}
            tone={data.aReceber.overdue > 0 ? "destructive" : "warning"}
            hint={data.aReceber.overdue > 0 ? `${formatCurrency(data.aReceber.overdue)} atrasado` : undefined}
          />
          <Row
            label="A pagar"
            value={data.aPagar.total}
            tone={data.aPagar.overdue > 0 ? "destructive" : "warning"}
            hint={data.aPagar.overdue > 0 ? `${formatCurrency(data.aPagar.overdue)} atrasado` : undefined}
          />
          <div className="my-1 border-t border-border/60" />
          <Row
            label="Resultado do mês"
            value={data.resultado}
            tone={data.resultado > 0 ? "success" : data.resultado < 0 ? "destructive" : undefined}
            strong
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Sem permissão para ver o financeiro deste espaço.</p>
      )}
      <Link href={href} className="flex items-center gap-1 text-xs text-primary hover:underline">
        Ver financeiro <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  hint,
  strong,
}: {
  label: string;
  value: number;
  tone?: "success" | "destructive" | "warning";
  hint?: string;
  strong?: boolean;
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={`text-xs ${strong ? "font-medium text-foreground" : "text-muted-foreground"}`}>
        {label}
        {hint && <span className="block text-[11px] text-destructive">{hint}</span>}
      </span>
      <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${toneClass}`}>{formatCurrency(value)}</span>
    </div>
  );
}
