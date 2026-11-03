"use client";

import { useState } from "react";
import { Briefcase, CalendarClock, ChevronDown, ChevronLeft, ClipboardList, Megaphone, Sparkles, Target, User, Users, LineChart, ListChecks, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SmartImporter } from "@/components/trabalho/smart-importer";
import { TaskImporter } from "@/components/importar/task-importer";
import { LegacyPlanningList, type LegacyPlanningItem } from "@/components/planejamento/planning-client";
import { AREA_INFO, TYPE_INFO, TYPES_BY_AREA, availableAreas, type ImportAccess, type ImportTypeId } from "@/lib/import/center";
import { SMART_EXAMPLES } from "@/lib/import/examples";
import type { ImportArea } from "@/lib/import/tasks";
import { cn } from "@/lib/utils";

type Company = { id: string; name: string };

const AREA_ICON: Record<ImportArea, LucideIcon> = { pessoal: User, clt: Briefcase, mkt: Sparkles };
const TYPE_ICON: Record<ImportTypeId, LucideIcon> = { tarefas: ListChecks, rotinas: CalendarClock, campanhas: Megaphone, publicos: Users, resultados: LineChart };

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs text-primary">{n}</span>
      {children}
    </h2>
  );
}

function ChoiceCard({ icon: Icon, label, description, selected, onClick }: { icon: LucideIcon; label: string; description: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex min-h-16 w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-primary/10" : "border-border hover:border-primary/40 hover:bg-secondary/40"
      )}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

/**
 * Central de Importação: área → tipo → formato/conteúdo → prévia →
 * confirmação → resultado. Tarefas/rotinas usam o TaskImporter; campanhas,
 * públicos e resultados usam o importador inteligente (transação única),
 * sempre com as empresas do módulo escolhido.
 */
export function ImportCenter({
  access,
  mktPending,
  companies,
  initialArea,
  initialType,
  legacy,
}: {
  access: ImportAccess;
  mktPending: boolean;
  companies: { clt: Company[]; mkt: Company[] };
  initialArea: ImportArea | null;
  initialType: ImportTypeId | null;
  legacy: { general: LegacyPlanningItem[]; mkt: LegacyPlanningItem[]; cltCompanies: Company[]; mktCompanies: Company[] };
}) {
  const areas = availableAreas(access);
  const [area, setArea] = useState<ImportArea | null>(initialArea ?? (areas.length === 1 ? areas[0] : null));
  const [type, setType] = useState<ImportTypeId | null>(initialType);
  const [legacyOpen, setLegacyOpen] = useState(false);

  function chooseArea(next: ImportArea) {
    setArea(next);
    if (!type || !TYPES_BY_AREA[next].includes(type)) setType(null);
  }

  const smart = type === "campanhas" || type === "publicos" || type === "resultados";
  const moduleCompanies = area === "clt" ? companies.clt : area === "mkt" ? companies.mkt : [];
  const legacyCount = legacy.general.length + legacy.mkt.length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Central de Importação"
        description="Importe tarefas, rotinas, campanhas, públicos e resultados por texto ou JSON. Nada é gravado antes da sua confirmação."
      />

      <Card>
        <CardContent className="space-y-3 p-4">
          <StepTitle n={1}>Área de destino</StepTitle>
          <div role="radiogroup" aria-label="Área" className="grid gap-2 sm:grid-cols-3">
            {areas.map((a) => (
              <ChoiceCard key={a} icon={AREA_ICON[a]} label={AREA_INFO[a].label} description={AREA_INFO[a].description} selected={area === a} onClick={() => chooseArea(a)} />
            ))}
          </div>
          {mktPending && <p className="text-xs text-amber-300">Visionário Dev / MKT aparece aqui depois que a migração do módulo MKT for aplicada no banco.</p>}
          <p className="text-xs text-muted-foreground">As áreas ficam separadas: empresas e campanhas do CLT nunca entram no MKT (e vice-versa). Financeiros não são importados aqui.</p>
        </CardContent>
      </Card>

      {area && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <StepTitle n={2}>Tipo de registro</StepTitle>
            <div role="radiogroup" aria-label="Tipo" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {TYPES_BY_AREA[area].map((t) => (
                <ChoiceCard key={t} icon={TYPE_ICON[t]} label={TYPE_INFO[t].label} description={TYPE_INFO[t].description} selected={type === t} onClick={() => setType(t)} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {area && type && (
        <section className="space-y-3" aria-label="Conteúdo da importação">
          <div className="flex items-center justify-between gap-2">
            <StepTitle n={3}>Conteúdo, prévia e confirmação</StepTitle>
            <button type="button" onClick={() => setType(null)} className="flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4" /> Trocar tipo
            </button>
          </div>
          {smart && area !== "pessoal" ? (
            moduleCompanies.length === 0 ? (
              <Card><CardContent className="p-4 text-sm text-muted-foreground">Cadastre uma empresa em {AREA_INFO[area].label} → Empresas antes de importar {TYPE_INFO[type].label.toLowerCase()}.</CardContent></Card>
            ) : (
              <SmartImporter
                key={`${area}-${type}`}
                module={area}
                companies={moduleCompanies}
                title={`${TYPE_INFO[type].label} · ${AREA_INFO[area].label}`}
                example={SMART_EXAMPLES[type as keyof typeof SMART_EXAMPLES].text}
                exampleJson={SMART_EXAMPLES[type as keyof typeof SMART_EXAMPLES].json}
                initialMode="text"
              />
            )
          ) : (
            <TaskImporter key={`${area}-${type}`} area={area} type={type === "rotinas" ? "rotinas" : "tarefas"} areaLabel={AREA_INFO[area].label} />
          )}
        </section>
      )}

      {legacyCount > 0 && (
        <Card>
          <CardContent className="p-0">
            <button type="button" onClick={() => setLegacyOpen((v) => !v)} aria-expanded={legacyOpen} className="flex min-h-14 w-full items-center gap-3 p-4 text-left">
              <ClipboardList className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Itens antigos do Planejamento ({legacyCount})</span>
                <span className="block text-xs text-muted-foreground">Checklist, previsto × real e “Criar campanha” continuam aqui.</span>
              </span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", legacyOpen && "rotate-180")} />
            </button>
            {legacyOpen && (
              <div className="space-y-5 border-t p-4">
                {legacy.general.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="flex items-center gap-2 text-sm font-medium"><Target className="h-4 w-4 text-muted-foreground" /> Pessoal e Trabalho / CLT</h3>
                    <LegacyPlanningList initial={legacy.general} companies={legacy.cltCompanies} />
                  </div>
                )}
                {legacy.mkt.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-muted-foreground" /> Visionário Dev / MKT</h3>
                    <LegacyPlanningList module="mkt" initial={legacy.mkt} companies={legacy.mktCompanies} />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
