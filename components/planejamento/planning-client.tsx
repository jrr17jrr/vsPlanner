"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { updatePlanningItemAction, deletePlanningItemAction, createCampaignFromPlanningAction, type PlanningArea } from "@/lib/supabase/planning-actions";

type Company = { id: string; name: string };
export type LegacyPlanningItem = { id: string; area: PlanningArea; company_id: string | null; title: string; notes: string | null; planned_date: string | null; objective: string | null; planned_amount: number; actual_amount: number; views: number; messages: number; completed: boolean; campaign_id: string | null };

const money = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const AREA_LABEL: Record<PlanningArea, string> = { clt: "Trabalho / CLT", pessoal: "Tarefas pessoais", rotina: "Rotina", visionario: "Visionário Dev" };

/**
 * Itens antigos do Planejamento (tabela planning_items) — mesma lista e as
 * mesmas ações de antes (checklist, previsto x real, excluir, criar campanha),
 * agora dentro da Central de Importação. `module="mkt"`: itens das empresas
 * do MKT (no MKT a área "clt" significa MKT).
 */
export function LegacyPlanningList({ initial, companies, module = "clt" }: { initial: LegacyPlanningItem[]; companies: Company[]; module?: "clt" | "mkt" }) {
  const mkt = module === "mkt";
  const areaLabel = (a: PlanningArea) => (mkt && a === "clt" ? "MKT" : AREA_LABEL[a]);
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState("all");
  const [busy, start] = useTransition();
  const companyName = (id?: string | null) => companies.find((c) => c.id === id)?.name || "";
  const areas = [...new Set(items.map((i) => i.area))];

  const change = (id: string, patch: { completed?: boolean }) =>
    start(async () => {
      const r = await updatePlanningItemAction(id, patch);
      if (r.error) { toast.error(r.error); return; }
      setItems((old) => old.map((x) => (x.id === id ? { ...x, ...(patch.completed !== undefined ? { completed: patch.completed } : {}) } : x)));
    });
  const remove = (id: string) => {
    if (!confirm("Excluir este item antigo do planejamento? Tarefas e campanhas já criadas não são afetadas.")) return;
    start(async () => {
      const r = await deletePlanningItemAction(id);
      if (r.error) { toast.error(r.error); return; }
      setItems((old) => old.filter((x) => x.id !== id));
    });
  };
  const create = (id: string) => {
    if (!confirm("Criar registro desta campanha no VSPlanner? Isso NÃO publica anúncios no Meta Ads.")) return;
    start(async () => {
      const r = await createCampaignFromPlanningAction(id);
      if (r.error) { toast.error(r.error); return; }
      toast.success(r.success);
      setItems((old) => old.map((x) => (x.id === id ? { ...x, campaign_id: "criada", completed: true } : x)));
    });
  };

  const filtered = items.filter((i) => filter === "all" || i.area === filter || i.company_id === filter);
  const planned = filtered.reduce((s, i) => s + Number(i.planned_amount || 0), 0);
  const actual = filtered.reduce((s, i) => s + Number(i.actual_amount || 0), 0);

  if (!items.length) return <p className="text-sm text-muted-foreground">Nenhum item antigo.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{items.length} item(ns) importado(s) pelo antigo Planejamento. Nada foi apagado.</p>
        <select className="h-10 rounded-md border bg-background px-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar itens antigos">
          <option value="all">Todas as áreas</option>
          {areas.map((a) => <option key={a} value={a}>{areaLabel(a)}</option>)}
          {companies.filter((c) => items.some((i) => i.company_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {[["Investimento previsto", planned], ["Gasto real informado", actual], ["Diferença", planned - actual]].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-semibold">{money(Number(value))}</p></div>
        ))}
      </div>
      <ul className="space-y-2">
        {filtered.map((item) => (
          <li key={item.id} className="flex flex-wrap items-start gap-3 rounded-lg border p-3">
            <Checkbox className="mt-0.5" checked={item.completed} disabled={busy} onCheckedChange={(v) => change(item.id, { completed: v === true })} aria-label={`Concluído: ${item.title}`} />
            <div className="min-w-0 flex-1 space-y-1">
              <p className={item.completed ? "font-medium text-muted-foreground line-through" : "font-medium"}>{item.title}</p>
              <p className="text-xs text-muted-foreground">{areaLabel(item.area)}{item.company_id ? " · " + companyName(item.company_id) : ""}{item.planned_date ? " · " + item.planned_date.split("-").reverse().join("/") : ""}</p>
              {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
              {item.planned_amount > 0 && <p className="text-xs">Previsto: {money(Number(item.planned_amount))} · Real: {money(Number(item.actual_amount || 0))}</p>}
              {item.area === "clt" && item.company_id && !item.campaign_id && (
                <Button size="sm" variant="outline" className="h-9" disabled={busy || !item.planned_date} onClick={() => create(item.id)}>Criar campanha no VSPlanner</Button>
              )}
              {item.campaign_id && <span className="text-xs text-emerald-500">Campanha vinculada</span>}
            </div>
            <Button variant="ghost" size="sm" className="h-9" disabled={busy} onClick={() => remove(item.id)}>Excluir</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
