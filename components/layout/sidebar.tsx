import { Sparkles } from "lucide-react";
import { NavContent } from "@/components/layout/nav-content";
import { SpaceSwitcher } from "@/components/shared/space-switcher";

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <span className="text-base font-semibold text-sidebar-foreground">VSPlanner</span>
      </div>
      <div className="px-3">
        <SpaceSwitcher />
      </div>
      <NavContent />
    </aside>
  );
}
