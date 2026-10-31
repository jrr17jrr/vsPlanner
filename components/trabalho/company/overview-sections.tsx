"use client";

import { ArrowRight, CheckCircle2, Circle, ListChecks, Megaphone, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CollapsibleSection } from "@/components/trabalho/company/collapsible-section";
import { OpenTabButton } from "@/components/trabalho/company/company-tabs";
import { AudienceTypeBadge } from "@/components/trabalho/company/audience-type-badge";
import { describeAudienceSettings } from "@/lib/clt/audience-summary";
import { isActiveOn, isDoneOn, todaySaoPaulo, type TaskOccurrence } from "@/lib/clt/task-state";
import type { AudienceRecord } from "@/lib/supabase/clt-audience-actions";
import type { CltCampaign, CltTask } from "@/types/database.types";

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBR = (s: string) => s.slice(0, 10).split("-").reverse().join("/");
const PREVIEW = 5;
const statusRank = (s: string) => (s === "ativa" ? 0 : s === "pausada" ? 1 : s === "finalizada" ? 3 : 2);
const statusTone: Record<string, "success" | "warning" | "secondary" | "default"> = { ativa: "success", pausada: "warning", finalizada: "secondary", planejada: "default" };

function SeeAll({ tab, label }: { tab: "campanhas" | "publicos" | "tarefas"; label: string }) {
  return <div className="flex justify-end pt-1"><OpenTabButton tab={tab}>{label}<ArrowRight className="h-4 w-4" aria-hidden="true" /></OpenTabButton></div>;
}

export function OverviewCampaigns({ campaigns }: { campaigns: CltCampaign[] }) {
  const sorted = [...campaigns].sort((a, b) => statusRank(a.campaign_status || "planejada") - statusRank(b.campaign_status || "planejada") || b.starts_on.localeCompare(a.starts_on));
  const messages = campaigns.reduce((a, c) => a + Number(c.messages || 0), 0);
  const sales = campaigns.reduce((a, c) => a + Number(c.sales || 0), 0);
  const active = campaigns.filter(c => c.campaign_status === "ativa").length;
  return (
    <CollapsibleSection title="Campanhas da empresa" icon={<Megaphone className="h-4 w-4" />} summary={`${campaigns.length} campanha(s)${active ? ` · ${active} ativa(s)` : ""}`}>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Totais das campanhas cadastradas: {messages} mensagens · {sales} vendas. O investimento mostrado é a soma dos registros, não necessariamente apenas do mês atual.</p>
        {sorted.slice(0, PREVIEW).map(c => (
          <div key={c.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 break-words font-medium">{c.name}</p>
              <Badge variant={statusTone[c.campaign_status || "planejada"] ?? "default"} className="capitalize">{c.campaign_status || "planejada"}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{dateBR(c.starts_on)} até {dateBR(c.ends_on)}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span>Investido: <b>{money(Number(c.spent_amount || 0))}</b></span>
              <span>Mensagens: <b>{c.messages}</b></span>
              <span>Vendas: <b>{c.sales}</b></span>
              <span>Visualizações: <b>{c.views}</b></span>
            </div>
          </div>
        ))}
        {!campaigns.length && <p className="text-sm text-muted-foreground">Nenhuma campanha cadastrada para esta empresa.</p>}
        {campaigns.length > PREVIEW && <p className="text-xs text-muted-foreground">Mostrando {PREVIEW} de {campaigns.length}.</p>}
        <SeeAll tab="campanhas" label="Ver todas as campanhas" />
      </div>
    </CollapsibleSection>
  );
}

export function OverviewAudiences({ audiences, linkedSetCount }: { audiences: AudienceRecord[]; linkedSetCount: Record<string, number> }) {
  const count = (t: string) => audiences.filter(a => a.audience_type === t).length;
  const summary = audiences.length ? `${audiences.length} público(s) · ${count("salvo")} salvo(s) · ${count("personalizado")} personalizado(s) · ${count("semelhante")} semelhante(s)` : "Nenhum público cadastrado";
  return (
    <CollapsibleSection title="Públicos da empresa" icon={<Users className="h-4 w-4" />} summary={summary}>
      <div className="space-y-2">
        {audiences.slice(0, PREVIEW).map(a => {
          const info = describeAudienceSettings(a.settings).filter(([k]) => ["Localização", "Idade", "Interesses", "Retenção", "Porcentagem"].includes(k));
          return (
            <div key={a.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 break-words font-medium">{a.name}</p><AudienceTypeBadge type={a.audience_type} /></div>
              {info.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{info.map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>}
              {!!linkedSetCount[a.id] && <p className="mt-1 text-xs text-primary">Usado em {linkedSetCount[a.id]} conjunto(s)</p>}
            </div>
          );
        })}
        {!audiences.length && <p className="text-sm text-muted-foreground">Nenhum público cadastrado. Crie um ou importe na aba Públicos.</p>}
        {audiences.length > PREVIEW && <p className="text-xs text-muted-foreground">Mostrando {PREVIEW} de {audiences.length}.</p>}
        <SeeAll tab="publicos" label="Gerenciar públicos" />
      </div>
    </CollapsibleSection>
  );
}

export function OverviewTasks({ tasks, occurrences, pending }: { tasks: CltTask[]; occurrences: TaskOccurrence[]; pending: number }) {
  const today = todaySaoPaulo();
  const ordered = [...tasks].sort((a, b) => Number(isDoneOn(a, occurrences, today)) - Number(isDoneOn(b, occurrences, today)) || (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  return (
    <CollapsibleSection title="Tarefas da empresa" icon={<ListChecks className="h-4 w-4" />} summary={`${pending} pendente(s) · ${tasks.length} no total`}>
      <div className="space-y-2">
        {ordered.slice(0, PREVIEW).map(t => {
          const done = isDoneOn(t, occurrences, today);
          const scheduled = isActiveOn(t, today);
          return (
            <div key={t.id} className={"flex items-start gap-3 rounded-lg border p-3 " + (done ? "opacity-70" : "")}>
              {done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Concluída" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Pendente" />}
              <div className="min-w-0 flex-1">
                <p className={"break-words text-sm font-medium " + (done ? "line-through" : "")}>{t.title}</p>
                <p className="text-xs text-muted-foreground">
                  {done ? (t.recurrence === "weekly" ? "Concluída hoje" : "Concluída") : t.recurrence === "weekly" && !scheduled ? "Não agendada para hoje" : "Pendente"}
                  {t.recurrence === "weekly" ? " · Recorrente" : t.due_date ? " · " + dateBR(t.due_date) : ""}
                  {t.priority === "importante" ? " · Importante" : ""}
                </p>
              </div>
            </div>
          );
        })}
        {!tasks.length && <p className="text-sm text-muted-foreground">Nenhuma tarefa cadastrada para esta empresa.</p>}
        {tasks.length > PREVIEW && <p className="text-xs text-muted-foreground">Mostrando {PREVIEW} de {tasks.length}.</p>}
        <SeeAll tab="tarefas" label="Ver todas as tarefas" />
      </div>
    </CollapsibleSection>
  );
}
