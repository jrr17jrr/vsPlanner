"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthProfile } from "@/components/providers/auth-profile-provider";
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
  // Tudo real (ver app/(app)/layout.tsx): system_role, acesso a
  // Visionário Dev/TikTok e a permissão de CADA módulo vêm da sessão
  // Supabase de quem está navegando, nunca de uma persona mock fixa.
  const { profile, canAccessVisionario, canAccessTiktok, visionarioModulePermissions, tiktokModulePermissions } =
    useAuthProfile();
  const isSuperAdmin = profile.system_role === "super_admin";

  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-2 no-scrollbar">
      <NavLink item={NAV_HOME} onNavigate={onNavigate} />

      {NAV_GROUPS.map((group) => {
        if (group.requires === "visionario" && !canAccessVisionario) return null;
        if (group.requires === "tiktok" && !canAccessTiktok) return null;
        // Cada item com `module` só aparece se `has_module_permission`
        // (real, calculada no layout) permitir — nunca só "faz parte do
        // space". É o que faz Financeiro sumir do menu pra quem tem
        // Clientes/Reuniões/Trabalhos mas não Financeiro.
        const permissions =
          group.requires === "visionario" ? visionarioModulePermissions : group.requires === "tiktok" ? tiktokModulePermissions : undefined;
        const items = permissions
          ? group.items.filter((item) => !item.module || permissions[item.module])
          : group.items;
        if (items.length === 0) return null;
        return (
          <div key={group.label}>
            <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {items.map((item) => (
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
