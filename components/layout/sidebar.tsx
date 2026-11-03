"use client";

import { PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";
import { NavContent } from "@/components/layout/nav-content";
import { setSidebarCollapsed, useSidebarCollapsed } from "@/components/layout/sidebar-state";
import { SpaceSwitcher } from "@/components/shared/space-switcher";
import { cn } from "@/lib/utils";

/** Menu do computador. Pode ser recolhido (só ícones); a escolha fica salva neste navegador. */
export function Sidebar() {
  const collapsed = useSidebarCollapsed();
  return (
    <aside
      data-collapsed={collapsed || undefined}
      className={cn(
        "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex",
        collapsed ? "w-[60px]" : "w-64"
      )}
    >
      <div className={cn("flex items-center gap-2 py-4", collapsed ? "flex-col px-2" : "px-4")}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        {!collapsed && <span className="flex-1 truncate text-base font-semibold text-sidebar-foreground">VSPlanner</span>}
        <button
          type="button"
          onClick={() => setSidebarCollapsed(!collapsed)}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-pressed={collapsed}
          className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>
      {!collapsed && (
        <div className="px-3 pb-2">
          <SpaceSwitcher />
        </div>
      )}
      <NavContent collapsed={collapsed} onExpand={() => setSidebarCollapsed(false)} />
    </aside>
  );
}
