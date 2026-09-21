import {
  Home,
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
  Video,
  Settings,
  ShieldAlert,
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
   * pessoal, Sistema) só dependem de estar autenticado.
   */
  module?: ModulePermissionModule;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  requires?: "visionario" | "tiktok";
}

export const NAV_HOME: NavItem = { label: "Início", href: "/", icon: Home };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Minha Vida",
    items: [
      { label: "Hoje", href: "/hoje", icon: Sun },
      { label: "Minha Rotina", href: "/rotina", icon: CalendarClock },
      { label: "Trabalho / CLT", href: "/trabalho", icon: Briefcase },
      { label: "Tarefas", href: "/tarefas", icon: ListChecks },
      { label: "Histórico", href: "/historico", icon: History },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { label: "Meu Dinheiro", href: "/financeiro", icon: Wallet },
      { label: "Metas", href: "/metas", icon: Target },
    ],
  },
  {
    label: "Visionário Dev",
    requires: "visionario",
    items: [
      { label: "Visão Geral", href: "/visionario", icon: LayoutDashboard, module: "visao_geral" },
      { label: "Clientes", href: "/visionario/clientes", icon: Users, module: "clientes" },
      { label: "Serviços", href: "/visionario/servicos", icon: Layers, module: "servicos" },
      { label: "Trabalhos", href: "/visionario/trabalhos", icon: Briefcase, module: "trabalhos" },
      { label: "Reuniões", href: "/visionario/reunioes", icon: Handshake, module: "reunioes" },
      { label: "Vendedores", href: "/visionario/vendedores", icon: HandCoins, module: "vendedores" },
      { label: "Financeiro", href: "/visionario/financeiro", icon: LineChart, module: "financeiro" },
      { label: "Sites & Domínios", href: "/visionario/sites", icon: Globe, module: "sites" },
    ],
  },
  {
    label: "TikTok",
    requires: "tiktok",
    items: [
      // A "Visão Geral" do TikTok (app/(app)/tiktok/page.tsx) É o
      // dashboard financeiro — exige financeiro.view igual à própria
      // página, nunca só acesso ao space.
      { label: "Visão Geral", href: "/tiktok", icon: Video, module: "financeiro" },
      { label: "Financeiro", href: "/tiktok/financeiro", icon: LineChart, module: "financeiro" },
    ],
  },
  {
    label: "Sistema",
    items: [{ label: "Configurações", href: "/configuracoes", icon: Settings }],
  },
];

export const NAV_DEV_PANEL: NavItem = {
  label: "Painel Dev",
  href: "/dev",
  icon: ShieldAlert,
};
