import { hasModule, canAccessArea, type NavAccess } from "@/lib/nav";

/**
 * Botão "+ Novo": cada opção leva à página que JÁ tem o formulário e abre
 * esse mesmo formulário (parâmetro `?novo=<kind>`, ver
 * components/shared/quick-create-listener.tsx). Nada de formulário paralelo:
 * validações, permissões e gravação são as das telas.
 */

export type QuickCreateKind = "tarefa" | "atividade" | "campanha" | "cliente" | "receita" | "despesa" | "reuniao" | "servico";

export type QuickArea = "pessoal" | "clt" | "mkt" | "visionario" | "tiktok";

export type QuickDestination = { area: QuickArea; label: string; href: string };

export type QuickOption = { kind: QuickCreateKind; label: string; description: string; destinations: QuickDestination[] };

export const AREA_LABEL: Record<QuickArea, string> = {
  pessoal: "Pessoal",
  clt: "Trabalho / CLT",
  mkt: "Visionário Dev / MKT",
  visionario: "Visionário Dev",
  tiktok: "TikTok",
};

const withNovo = (path: string, kind: string) => `${path}?novo=${kind}`;

type DestinationRule = QuickDestination & { allowed: (a: NavAccess) => boolean };

const always = () => true;
const clt = (a: NavAccess) => canAccessArea(a, "clt");
const mkt = (a: NavAccess) => canAccessArea(a, "visionario");

const OPTIONS: { kind: QuickCreateKind; label: string; description: string; destinations: DestinationRule[] }[] = [
  {
    kind: "tarefa",
    label: "Nova tarefa",
    description: "Com execução, prazo final, subtarefas e lembretes.",
    destinations: [
      { area: "pessoal", label: AREA_LABEL.pessoal, href: withNovo("/tarefas", "tarefa"), allowed: always },
      { area: "clt", label: AREA_LABEL.clt, href: withNovo("/trabalho/tarefas", "tarefa"), allowed: clt },
      { area: "mkt", label: AREA_LABEL.mkt, href: withNovo("/visionario/mkt/tarefas", "tarefa"), allowed: mkt },
      { area: "visionario", label: "Visionário Dev (Trabalhos)", href: withNovo("/visionario/trabalhos", "tarefa"), allowed: (a) => hasModule(a, "visionario", "trabalhos") },
    ],
  },
  {
    kind: "atividade",
    label: "Nova atividade da rotina",
    description: "Atividade normal ou tarefa vinculada, semanal ou de um dia.",
    destinations: [{ area: "pessoal", label: AREA_LABEL.pessoal, href: withNovo("/rotina", "atividade"), allowed: always }],
  },
  {
    kind: "campanha",
    label: "Nova campanha",
    description: "Registro de campanha da empresa (não publica no Meta).",
    destinations: [
      { area: "clt", label: AREA_LABEL.clt, href: withNovo("/trabalho/campanhas", "campanha"), allowed: clt },
      { area: "mkt", label: AREA_LABEL.mkt, href: withNovo("/visionario/mkt/campanhas", "campanha"), allowed: mkt },
    ],
  },
  {
    kind: "cliente",
    label: "Novo cliente",
    description: "Cliente da Visionário Dev.",
    destinations: [{ area: "visionario", label: AREA_LABEL.visionario, href: withNovo("/visionario/clientes", "cliente"), allowed: (a) => hasModule(a, "visionario", "clientes") }],
  },
  {
    kind: "receita",
    label: "Nova receita",
    description: "Entrada no financeiro escolhido (cada financeiro é separado).",
    destinations: [
      { area: "pessoal", label: "Pessoal (Meu Dinheiro)", href: withNovo("/financeiro", "receita"), allowed: always },
      { area: "visionario", label: AREA_LABEL.visionario, href: withNovo("/visionario/financeiro", "receita"), allowed: (a) => hasModule(a, "visionario", "financeiro") },
      { area: "tiktok", label: AREA_LABEL.tiktok, href: withNovo("/tiktok/financeiro", "receita"), allowed: (a) => hasModule(a, "tiktok", "financeiro") },
    ],
  },
  {
    kind: "despesa",
    label: "Nova despesa",
    description: "Saída no financeiro escolhido (cada financeiro é separado).",
    destinations: [
      { area: "pessoal", label: "Pessoal (Meu Dinheiro)", href: withNovo("/financeiro", "despesa"), allowed: always },
      { area: "visionario", label: AREA_LABEL.visionario, href: withNovo("/visionario/financeiro", "despesa"), allowed: (a) => hasModule(a, "visionario", "financeiro") },
      { area: "tiktok", label: AREA_LABEL.tiktok, href: withNovo("/tiktok/financeiro", "despesa"), allowed: (a) => hasModule(a, "tiktok", "financeiro") },
    ],
  },
  {
    kind: "reuniao",
    label: "Nova reunião",
    description: "Reunião ou compromisso da Visionário Dev.",
    destinations: [{ area: "visionario", label: AREA_LABEL.visionario, href: withNovo("/visionario/reunioes", "reuniao"), allowed: (a) => hasModule(a, "visionario", "reunioes") }],
  },
  {
    kind: "servico",
    label: "Novo serviço",
    description: "Serviço do catálogo da Visionário Dev.",
    destinations: [{ area: "visionario", label: AREA_LABEL.visionario, href: withNovo("/visionario/servicos", "servico"), allowed: (a) => hasModule(a, "visionario", "servicos") }],
  },
];

/** Opções e destinos permitidos (opção sem destino permitido some). */
export function quickCreateOptions(access: NavAccess): QuickOption[] {
  return OPTIONS.map((o) => ({ kind: o.kind, label: o.label, description: o.description, destinations: o.destinations.filter((d) => d.allowed(access)).map(({ area, label, href }) => ({ area, label, href })) })).filter((o) => o.destinations.length > 0);
}

/** Área em que a pessoa está (para sugerir o destino). */
export function areaFromPath(pathname: string): QuickArea {
  if (pathname.startsWith("/visionario/mkt")) return "mkt";
  if (pathname.startsWith("/visionario")) return "visionario";
  if (pathname.startsWith("/trabalho")) return "clt";
  if (pathname.startsWith("/tiktok")) return "tiktok";
  return "pessoal";
}

/** Destino sugerido: o da área atual; se não houver, MKT ↔ Visionário são vizinhos; senão o primeiro. */
export function suggestDestination(option: QuickOption, pathname: string): QuickDestination {
  const area = areaFromPath(pathname);
  const exact = option.destinations.find((d) => d.area === area);
  if (exact) return exact;
  const neighbor = area === "mkt" ? "visionario" : area === "visionario" ? "mkt" : null;
  return option.destinations.find((d) => d.area === neighbor) ?? option.destinations[0];
}
