"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { NAV_GROUPS, NAV_HOME, NAV_DEV_PANEL, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const { canAccessVisionario, canAccessTiktok, isSuperAdmin } = useAuth();

  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-2 no-scrollbar">
      <NavLink item={NAV_HOME} onNavigate={onNavigate} />

      {NAV_GROUPS.map((group) => {
        if (group.requires === "visionario" && !canAccessVisionario) return null;
        if (group.requires === "tiktok" && !canAccessTiktok) return null;
        return (
          <div key={group.label}>
            <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        );
      })}

      {isSuperAdmin && (
        <div>
          <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
            Administração
          </p>
          <NavLink item={NAV_DEV_PANEL} onNavigate={onNavigate} />
        </div>
      )}
    </nav>
  );
}
