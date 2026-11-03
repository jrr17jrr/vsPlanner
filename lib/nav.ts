import {
  Home,
  Upload,
  Sun,
  CalendarClock,
  ListChecks,
  History,
  Wallet,
  Target,
  LayoutDashboard,
  Users,
  Layers,
  Briefcase,
  Handshake,
  HandCoins,
  LineChart,
  Globe,
  AtSign,
  Video,
  Megaphone,
  FileText,
  Building2,
  Settings,
  ShieldAlert,
  HeartPulse,
  PiggyBank,
  Sparkles,
  Bot,
  type LucideIcon,
} from "lucide-react";
import type { ModulePermissionModule } from "@/types/database.types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Módulo (Visionário Dev/TikTok) que decide se este item aparece no
   * menu — checado contra `has_module_permission` real (ver
   * app/(app)/layout.tsx). Itens sem `module` (Minha Vida, Financeiro
   * pessoal, globais) só dependem de estar autenticado.
   */
  module?: ModulePermissionModule;
  /** Ativo só na rota exata (ex.: "Visão Geral" de um submenu). */
  exact?: boolean;
  /** Submenu expansível (accordion). O href do pai é o prefixo das rotas filhas. */
  children?: NavItem[];
}

export type NavRequirement = "visionario" | "tiktok" | "clt";

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  requires?: NavRequirement;
}

export const NAV_HOME: NavItem = { label: "Início", href: "/", icon: Home, exact: true };

/** Mesmas 7 páginas no Trabalho / CLT e no Visionário Dev → MKT (sistema compartilhado, dados separados). */
function cltPages(base: string): NavItem[] {
  return [
    { label: "Visão Geral", href: base, icon: LayoutDashboard, exact: true },
    { label: "Empresas", href: `${base}/empresas`, icon: Building2 },
    { label: "Campanhas", href: `${base}/campanhas`, icon: Megaphone },
    { label: "Análises", href: `${base}/analises`, icon: LineChart },
    { label: "Tarefas", href: `${base}/tarefas`, icon: ListChecks },
    { label: "Rotina", href: `${base}/rotina`, icon: CalendarClock },
    { label: "Relatórios", href: `${base}/relatorios`, icon: FileText },
  ];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "minha-vida",
    label: "Minha Vida",
    icon: HeartPulse,
    items: [
      { label: "Meu Dia", href: "/hoje", icon: Sun },
      { label: "Minha Rotina", href: "/rotina", icon: CalendarClock },
      { label: "Tarefas", href: "/tarefas", icon: ListChecks },
      { label: "Histórico", href: "/historico", icon: History },
    ],
  },
  {
    id: "financeiro-pessoal",
    label: "Financeiro Pessoal",
    icon: PiggyBank,
    items: [
      { label: "Meu Dinheiro", href: "/financeiro", icon: Wallet },
      { label: "Metas", href: "/metas", icon: Target },
    ],
  },
  {
    id: "visionario",
    label: "Visionário Dev",
    icon: Sparkles,
    requires: "visionario",
    items: [
      { label: "Visão Geral", href: "/visionario", icon: LayoutDashboard, module: "visao_geral", exact: true },
      { label: "Clientes", href: "/visionario/clientes", icon: Users, module: "clientes" },
      { label: "MKT", href: "/visionario/mkt", icon: Megaphone, children: cltPages("/visionario/mkt") },
      { label: "Serviços", href: "/visionario/servicos", icon: Layers, module: "servicos" },
      { label: "Trabalhos", href: "/visionario/trabalhos", icon: Briefcase, module: "trabalhos" },
      { label: "Reuniões", href: "/visionario/reunioes", icon: Handshake, module: "reunioes" },
      { label: "Vendedores", href: "/visionario/vendedores", icon: HandCoins, module: "vendedores" },
      { label: "Financeiro", href: "/visionario/financeiro", icon: LineChart, module: "financeiro" },
      { label: "Sites", href: "/visionario/sites", icon: Globe, module: "sites" },
      { label: "Domínios", href: "/visionario/dominios", icon: AtSign, module: "sites" },
    ],
  },
  {
    id: "clt",
    label: "Trabalho / CLT",
    icon: Briefcase,
    requires: "clt",
    items: cltPages("/trabalho"),
  },
  {
    id: "tiktok",
    label: "TikTok",
    icon: Video,
    requires: "tiktok",
    items: [
      // A "Visão Geral" do TikTok (app/(app)/tiktok/page.tsx) É o
      // dashboard financeiro — exige financeiro.view igual à própria
      // página, nunca só acesso ao space.
      { label: "Visão Geral", href: "/tiktok", icon: LayoutDashboard, module: "financeiro", exact: true },
      { label: "Sofia IA / Maria", href: "/tiktok/projetos", icon: Bot, module: "financeiro" },
      { label: "Financeiro", href: "/tiktok/financeiro", icon: LineChart, module: "financeiro" },
    ],
  },
];

export const NAV_IMPORT: NavItem = { label: "Central de Importação", href: "/importar", icon: Upload };
export const NAV_SETTINGS: NavItem = { label: "Configurações", href: "/configuracoes", icon: Settings };
export const NAV_DEV_PANEL: NavItem = { label: "Painel Dev", href: "/dev", icon: ShieldAlert };

// ---------------------------------------------------------------------------
// Regras puras (testadas em lib/nav.test.ts) — usadas pelo menu, pela busca
// do menu, pela busca global e pelo botão + Novo. Uma única fonte de verdade
// para permissões de navegação.
// ---------------------------------------------------------------------------

export type NavAccess = {
  canAccessVisionario: boolean;
  canAccessTiktok: boolean;
  canAccessClt: boolean;
  visionarioModulePermissions: Partial<Record<ModulePermissionModule, boolean>>;
  tiktokModulePermissions: Partial<Record<ModulePermissionModule, boolean>>;
  isSuperAdmin: boolean;
};

export function canAccessArea(access: NavAccess, requires: NavRequirement | undefined): boolean {
  if (requires === "visionario") return access.canAccessVisionario;
  if (requires === "tiktok") return access.canAccessTiktok;
  if (requires === "clt") return access.canAccessClt;
  return true;
}

export function hasModule(access: NavAccess, area: "visionario" | "tiktok", module: ModulePermissionModule): boolean {
  if (!canAccessArea(access, area)) return false;
  const perms = area === "visionario" ? access.visionarioModulePermissions : access.tiktokModulePermissions;
  return !!perms[module];
}

/** Grupos e itens que a pessoa pode ver (grupo sem itens visíveis some). */
export function visibleNavGroups(access: NavAccess, groups: NavGroup[] = NAV_GROUPS): NavGroup[] {
  const out: NavGroup[] = [];
  for (const group of groups) {
    if (!canAccessArea(access, group.requires)) continue;
    const perms = group.requires === "visionario" ? access.visionarioModulePermissions : group.requires === "tiktok" ? access.tiktokModulePermissions : undefined;
    // Cada item com `module` só aparece se `has_module_permission` (real,
    // calculada no layout) permitir — nunca só "faz parte do space".
    const items = perms ? group.items.filter((item) => !item.module || perms[item.module]) : group.items;
    if (items.length) out.push({ ...group, items });
  }
  return out;
}

export function visibleGlobalItems(access: NavAccess): NavItem[] {
  return access.isSuperAdmin ? [NAV_IMPORT, NAV_SETTINGS, NAV_DEV_PANEL] : [NAV_IMPORT, NAV_SETTINGS];
}

export function isNavActive(pathname: string, item: Pick<NavItem, "href" | "exact">): boolean {
  const href = item.href.split("?")[0];
  if (item.exact || href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function itemContains(pathname: string, item: NavItem): boolean {
  if (item.children?.length) return item.children.some((c) => itemContains(pathname, c)) || isNavActive(pathname, { href: item.href });
  return isNavActive(pathname, item);
}

/**
 * Grupo da página atual (abre sozinho). Quando duas regras casam
 * (ex.: "/visionario" exato x "/visionario/mkt/..."), vence o href mais
 * longo, então MKT fica dentro de Visionário Dev e Trabalho no CLT.
 */
export function activeGroupId(pathname: string, groups: NavGroup[]): string | null {
  let best: { id: string; len: number } | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      const candidates = item.children?.length ? [item, ...item.children] : [item];
      for (const c of candidates) {
        if (isNavActive(pathname, c.children?.length ? { href: c.href } : c)) {
          const len = c.href.length;
          if (!best || len > best.len) best = { id: group.id, len };
        }
      }
    }
  }
  return best?.id ?? null;
}

export function submenuContains(pathname: string, item: NavItem): boolean {
  return !!item.children?.length && itemContains(pathname, item);
}

export type NavSearchEntry = { label: string; href: string; icon: LucideIcon; path: string[]; key: string };

/** Lista plana de todas as páginas visíveis, com o caminho (para a busca). */
export function flattenNav(access: NavAccess): NavSearchEntry[] {
  const out: NavSearchEntry[] = [{ label: NAV_HOME.label, href: NAV_HOME.href, icon: NAV_HOME.icon, path: [], key: NAV_HOME.href }];
  for (const group of visibleNavGroups(access)) {
    for (const item of group.items) {
      if (item.children?.length) {
        for (const child of item.children) out.push({ label: child.label, href: child.href, icon: child.icon, path: [group.label, item.label], key: `${group.id}:${child.href}` });
      } else {
        out.push({ label: item.label, href: item.href, icon: item.icon, path: [group.label], key: `${group.id}:${item.href}` });
      }
    }
  }
  for (const item of visibleGlobalItems(access)) out.push({ label: item.label, href: item.href, icon: item.icon, path: [], key: item.href });
  return out;
}

export function normalizeSearch(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Busca de páginas: casa pelo nome da página (prioridade) ou pelo caminho
 * ("mkt campanhas", "clt tarefas"). Sem acento, sem diferença de caixa.
 */
export function searchNav(entries: NavSearchEntry[], query: string): NavSearchEntry[] {
  const q = normalizeSearch(query);
  if (!q) return [];
  const terms = q.split(/\s+/);
  const scored: { e: NavSearchEntry; score: number }[] = [];
  for (const e of entries) {
    const label = normalizeSearch(e.label);
    const full = normalizeSearch([...e.path, e.label].join(" ").replace("/", " "));
    let score = -1;
    if (label === q) score = 0;
    else if (label.startsWith(q)) score = 1;
    else if (label.includes(q)) score = 2;
    else if (terms.every((t) => full.includes(t))) score = 3;
    if (score >= 0) scored.push({ e, score });
  }
  return scored.sort((a, b) => a.score - b.score || a.e.path.length - b.e.path.length).map((s) => s.e);
}

export const navPathLabel = (e: Pick<NavSearchEntry, "path" | "label">) => [...e.path, e.label].join(" → ");
