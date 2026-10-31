"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useAuthProfile } from "@/components/providers/auth-profile-provider";
import { NAV_GROUPS, NAV_HOME, NAV_DEV_PANEL, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, onNavigate, nested = false }: { item: NavItem; onNavigate?: () => void; nested?: boolean }) {
  const pathname = usePathname();
  const active = item.exact ? pathname === item.href : isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-12 items-center gap-3.5 rounded-xl px-3.5 py-3 text-[15px] font-medium transition-colors lg:min-h-0 lg:gap-2.5 lg:rounded-md lg:px-2.5 lg:py-2 lg:text-sm",
        nested && "min-h-11 py-2.5 lg:py-1.5",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      )}
    >
      <Icon className="h-[22px] w-[22px] shrink-0 stroke-[2.1] lg:h-4 lg:w-4" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * Item com submenu (accordion): clicar abre/fecha; fica aberto enquanto a
 * rota atual estiver dentro dele (e abre sozinho ao entrar por um link).
 */
function NavGroupItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const inside = isActive(pathname, item.href);
  const [open, setOpen] = useState(inside);
  const panelId = useId();
  // Ao navegar para dentro do submenu (ex.: link direto), mantém aberto.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (inside) setOpen(true); }, [inside]);
  const Icon = item.icon;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-h-12 w-full items-center gap-3.5 rounded-xl px-3.5 py-3 text-left text-[15px] font-medium transition-colors lg:min-h-0 lg:gap-2.5 lg:rounded-md lg:px-2.5 lg:py-2 lg:text-sm",
          inside ? "text-sidebar-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        )}
      >
        <Icon className="h-[22px] w-[22px] shrink-0 stroke-[2.1] lg:h-4 lg:w-4" />
        <span className="flex-1 truncate">{item.label}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={panelId} className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-sidebar-foreground/10 pl-2 lg:ml-3.5">
          {item.children!.map((child) => (
            <NavLink key={child.href} item={child} onNavigate={onNavigate} nested />
          ))}
        </div>
      )}
    </div>
  );
}

export function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  // Tudo real (ver app/(app)/layout.tsx): system_role, acesso a
  // Visionário Dev/TikTok e a permissão de CADA módulo vêm da sessão
  // Supabase de quem está navegando, nunca de uma persona mock fixa.
  const { profile, canAccessVisionario, canAccessTiktok, canAccessClt, visionarioModulePermissions, tiktokModulePermissions } =
    useAuthProfile();
  const isSuperAdmin = profile.system_role === "super_admin";

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto px-3 py-3 pb-8 no-scrollbar">
      <NavLink item={NAV_HOME} onNavigate={onNavigate} />

      {NAV_GROUPS.map((group) => {
        if (group.requires === "visionario" && !canAccessVisionario) return null;
        if (group.requires === "tiktok" && !canAccessTiktok) return null;
        if (group.requires === "clt" && !canAccessClt) return null;
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
              {items.map((item) =>
                item.children?.length ? (
                  <NavGroupItem key={item.href} item={item} onNavigate={onNavigate} />
                ) : (
                  <NavLink key={item.href} item={item} onNavigate={onNavigate} />
                )
              )}
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
