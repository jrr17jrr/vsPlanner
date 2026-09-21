import Link from "next/link";
import { Rocket, Video, ArrowRight, Briefcase, CalendarClock, Wallet } from "lucide-react";
import { requireActiveProfile, findOrBootstrapSpace, requirePersonalSpace } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import { getTodayMeetingsForHoje } from "@/lib/supabase/meetings-actions";
import { getTodayWorkItemsForHoje } from "@/lib/supabase/work-items-actions";
import { listWorkItems } from "@/lib/supabase/repositories/work-items.repository";
import {
  listFinancialCharges,
  listFinancialPayments,
  listFinancialAccounts,
} from "@/lib/supabase/repositories/financial.repository";
import { totalBalance, monthSummary, listChargesForKind } from "@/lib/financial-calc";
import { VISIONARIO_DEV_SLUG, TIKTOK_SLUG } from "@/lib/space-slugs";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDateLong, todayKeySaoPaulo, currentMonthKeySaoPaulo } from "@/lib/format";
import type { Space } from "@/types/database.types";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

async function loadFinanceColumn(space: Space) {
  const allowed = await hasModulePermission(space.id, "financeiro", "view");
  if (!allowed) return null;

  const [charges, payments, accounts] = await Promise.all([
    listFinancialCharges(space.id),
    listFinancialPayments(space.id),
    listFinancialAccounts(space.id),
  ]);
  const month = monthSummary(charges, currentMonthKeySaoPaulo());
  const saldo = totalBalance(accounts, payments, new Map(charges.map((c) => [c.id, c.kind])));
  return { saldo, receita: month.receita, despesa: month.despesa, lucro: month.lucro };
}

/**
 * Dashboard raiz — 100% real, montado só com os espaços aos quais o
 * usuário tem acesso e só com os dados cujo módulo ele tem permissão de
 * ver. Rotina/Tarefas pessoais ainda não têm backend real (migration
 * 008 pendente) — por isso "Meu dia" mostra só Reuniões/Trabalhos reais
 * por enquanto, nunca um percentual calculado a partir de mock.
 */
export default async function DashboardPage() {
  const { profile } = await requireActiveProfile();
  const { space: personalSpace } = await requirePersonalSpace();

  const [visionarioSpace, tiktokSpace] = await Promise.all([
    findOrBootstrapSpace(VISIONARIO_DEV_SLUG, profile),
    findOrBootstrapSpace(TIKTOK_SLUG, profile),
  ]);

  const [meetingsResult, workItemsResult, pessoalFinance, visionarioFinance, tiktokFinance] = await Promise.all([
    getTodayMeetingsForHoje(),
    getTodayWorkItemsForHoje(),
    loadFinanceColumn(personalSpace),
    visionarioSpace ? loadFinanceColumn(visionarioSpace) : Promise.resolve(null),
    tiktokSpace ? loadFinanceColumn(tiktokSpace) : Promise.resolve(null),
  ]);

  const todayKey = todayKeySaoPaulo();

  type AttentionItem = { id: string; icon: typeof Briefcase; label: string; title: string; meta: string; urgent: boolean; href: string };
  const attentionItems: AttentionItem[] = [];

  if (visionarioSpace) {
    const canViewTrabalhos = await hasModulePermission(visionarioSpace.id, "trabalhos", "view");
    if (canViewTrabalhos) {
      const workItems = await listWorkItems(visionarioSpace.id);
      workItems
        .filter((w) => w.status !== "concluido" && w.due_date && w.due_date < todayKey)
        .forEach((w) => {
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

  for (const [space, href] of [
    [personalSpace, "/financeiro"],
    [visionarioSpace, "/visionario/financeiro"],
    [tiktokSpace, "/tiktok/financeiro"],
  ] as const) {
    if (!space) continue;
    const canView = await hasModulePermission(space.id, "financeiro", "view");
    if (!canView) continue;
    const [charges, payments] = await Promise.all([listFinancialCharges(space.id), listFinancialPayments(space.id)]);
    listChargesForKind(charges, payments, "saida")
      .filter((r) => r.bucket === "atrasadas")
      .forEach((r) => {
        attentionItems.push({
          id: r.charge.id,
          icon: Wallet,
          label: "Conta atrasada",
          title: `${r.charge.description} — ${formatCurrency(r.remaining)}`,
          meta: "atrasada",
          urgent: true,
          href,
        });
      });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`${greeting()}, ${profile.name.split(" ")[0]}`} description={formatDateLong(new Date())} />

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Meu dia</p>
          <span className="text-xs text-muted-foreground">
            {meetingsResult.meetings.length} reunião(ões) · {workItemsResult.workItems.length} trabalho(s)
          </span>
        </div>
        <Link href="/hoje" className="mt-3 flex items-center gap-1 text-sm text-primary hover:underline">
          Ver meu dia <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Resumo financeiro</h2>
        <Card className="p-4">
          <div className="grid grid-cols-1 gap-4 divide-y divide-border sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
            <FinanceColumn title="Pessoal" icon={Wallet} data={pessoalFinance} href="/financeiro" />
            {visionarioSpace && <FinanceColumn title="Visionário Dev" icon={Rocket} data={visionarioFinance} href="/visionario/financeiro" />}
            {tiktokSpace && <FinanceColumn title="TikTok" icon={Video} data={tiktokFinance} href="/tiktok/financeiro" />}
          </div>
        </Card>
      </section>

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
  data,
  href,
}: {
  title: string;
  icon: typeof Wallet;
  data: { saldo: number; receita: number; despesa: number; lucro: number } | null;
  href: string;
}) {
  return (
    <div className="flex flex-col gap-2 pt-4 first:pt-0 sm:pt-0 sm:px-4 sm:first:pl-0 sm:last:pr-0">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      </div>
      {data ? (
        <div className="flex flex-col gap-1">
          <Row label="Saldo atual" value={data.saldo} />
          <Row label="Receita (mês)" value={data.receita} tone="success" />
          <Row label="Despesas (mês)" value={data.despesa} tone="destructive" />
          <Row label="Lucro (mês)" value={data.lucro} tone={data.lucro >= 0 ? "success" : "destructive"} />
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

function Row({ label, value, tone }: { label: string; value: number; tone?: "success" | "destructive" }) {
  const toneClass = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${toneClass}`}>{formatCurrency(value)}</span>
    </div>
  );
}
