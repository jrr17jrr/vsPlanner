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
  HandCoins,
  LineChart,
  Globe,
  Video,
  Settings,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
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
      { label: "Visão Geral", href: "/visionario", icon: LayoutDashboard },
      { label: "Clientes", href: "/visionario/clientes", icon: Users },
      { label: "Serviços", href: "/visionario/servicos", icon: Layers },
      { label: "Trabalhos", href: "/visionario/trabalhos", icon: Briefcase },
      { label: "Vendedores", href: "/visionario/vendedores", icon: HandCoins },
      { label: "Financeiro", href: "/visionario/financeiro", icon: LineChart },
      { label: "Sites & Domínios", href: "/visionario/sites", icon: Globe },
    ],
  },
  {
    label: "TikTok",
    requires: "tiktok",
    items: [
      { label: "Visão Geral", href: "/tiktok", icon: Video },
      { label: "Financeiro", href: "/tiktok/financeiro", icon: LineChart },
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
