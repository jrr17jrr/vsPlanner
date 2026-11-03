"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Search, X } from "lucide-react";
import { QuickCreateButton } from "@/components/layout/quick-create-button";
import { useNavAccess } from "@/components/layout/use-nav-access";
import {
  NAV_HOME,
  activeGroupId,
  flattenNav,
  isNavActive,
  navPathLabel,
  searchNav,
  submenuContains,
  visibleGlobalItems,
  visibleNavGroups,
  type NavGroup,
  type NavItem,
} from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Painel que abre/fecha com animação de altura; fechado fica `inert` (fora do Tab e do leitor de tela). */
function Collapsible({ open, id, children, className }: { open: boolean; id?: string; children: ReactNode; className?: string }) {
  return (
    <div id={id} inert={!open} className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
      <div className={cn("min-h-0 overflow-hidden", className)}>{children}</div>
    </div>
  );
}

const rowBase =
  "flex min-h-12 w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9 lg:gap-2.5 lg:rounded-md lg:px-2.5 lg:py-1.5 lg:text-sm";
const iconBase = "h-[22px] w-[22px] shrink-0 stroke-[2.1] lg:h-4 lg:w-4";

function NavLink({ item, onNavigate, nested = false }: { item: NavItem; onNavigate?: () => void; nested?: boolean }) {
  const pathname = usePathname();
  const active = isNavActive(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        rowBase,
        nested && "min-h-11 lg:min-h-8",
        active
          ? "bg-primary/12 text-primary shadow-[inset_2px_0_0_0_var(--color-primary)]"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      )}
    >
      <Icon className={iconBase} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/** Submenu dentro de um grupo (ex.: Visionário Dev → MKT). */
function SubmenuItem({ item, open, onToggle, onNavigate }: { item: NavItem; open: boolean; onToggle: () => void; onNavigate?: () => void }) {
  const pathname = usePathname();
  const inside = submenuContains(pathname, item);
  const panelId = useId();
  const Icon = item.icon;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn(rowBase, inside ? "text-primary" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground")}
      >
        <Icon className={iconBase} />
        <span className="flex-1 truncate">{item.label}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <Collapsible open={open} id={panelId}>
        <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-sidebar-foreground/10 pl-2 lg:ml-3.5">
          {item.children!.map((child) => (
            <NavLink key={child.href} item={child} onNavigate={onNavigate} nested />
          ))}
        </div>
      </Collapsible>
    </div>
  );
}

function GroupSection({
  group,
  open,
  onToggle,
  openSubmenus,
  toggleSubmenu,
  onNavigate,
}: {
  group: NavGroup;
  open: boolean;
  onToggle: () => void;
  openSubmenus: Set<string>;
  toggleSubmenu: (href: string) => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const panelId = useId();
  const containsActive = activeGroupId(pathname, [group]) === group.id;
  const Icon = group.icon;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn(
          rowBase,
          "font-semibold",
          containsActive ? "text-sidebar-foreground" : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        )}
      >
        <Icon className={cn(iconBase, containsActive && "text-primary")} />
        <span className="flex-1 truncate">{group.label}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-sidebar-foreground/50 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <Collapsible open={open} id={panelId}>
        <div className="flex flex-col gap-0.5 pb-1 pl-2 pt-0.5 lg:pl-1.5">
          {group.items.map((item) =>
            item.children?.length ? (
              <SubmenuItem key={item.href} item={item} open={openSubmenus.has(item.href)} onToggle={() => toggleSubmenu(item.href)} onNavigate={onNavigate} />
            ) : (
              <NavLink key={item.href} item={item} onNavigate={onNavigate} />
            )
          )}
        </div>
      </Collapsible>
    </div>
  );
}

function initialSubmenus(pathname: string, groups: NavGroup[]): Set<string> {
  const open = new Set<string>();
  for (const g of groups) for (const item of g.items) if (submenuContains(pathname, item)) open.add(item.href);
  return open;
}

/**
 * Menu lateral (computador e celular). Permissões reais da sessão (ver
 * app/(app)/layout.tsx) decidem grupos e itens — as mesmas regras da busca e
 * do "+ Novo" (lib/nav.ts).
 *
 * - Grupos em acordeão: abrir um recolhe os outros; o da página atual abre sozinho.
 * - `collapsed` (computador): só ícones; tocar num grupo expande o menu nele.
 */
export function NavContent({ onNavigate, collapsed = false, onExpand }: { onNavigate?: () => void; collapsed?: boolean; onExpand?: () => void }) {
  const access = useNavAccess();
  const pathname = usePathname();
  const router = useRouter();
  const groups = useMemo(() => visibleNavGroups(access), [access]);
  const globals = useMemo(() => visibleGlobalItems(access), [access]);
  const entries = useMemo(() => flattenNav(access), [access]);

  const [openGroup, setOpenGroup] = useState<string | null>(() => activeGroupId(pathname, groups));
  const [openSubmenus, setOpenSubmenus] = useState<Set<string>>(() => initialSubmenus(pathname, groups));
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [seenPath, setSeenPath] = useState(pathname);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsId = useId();

  // Ao navegar: abre o grupo/submenu da nova página e limpa a busca
  // (ajuste de estado durante a renderização, sem efeito).
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    const active = activeGroupId(pathname, groups);
    if (active) setOpenGroup(active);
    setOpenSubmenus((prev) => new Set([...prev, ...initialSubmenus(pathname, groups)]));
    setQuery("");
  }

  const results = useMemo(() => searchNav(entries, query), [entries, query]);
  const searching = query.trim().length > 0;

  function toggleSubmenu(href: string) {
    setOpenSubmenus((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  function goTo(href: string) {
    setQuery("");
    onNavigate?.();
    router.push(href);
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && results[highlight]) { e.preventDefault(); goTo(results[highlight].href); }
    else if (e.key === "Escape") { setQuery(""); }
  }

  if (collapsed) {
    const activeGroup = activeGroupId(pathname, groups);
    const iconButton = "flex h-10 w-10 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
    return (
      <nav aria-label="Menu principal" className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-2 py-3 no-scrollbar">
        <button type="button" title="Buscar página" aria-label="Buscar página" onClick={() => { onExpand?.(); setTimeout(() => searchRef.current?.focus(), 220); }} className={cn(iconButton, "text-sidebar-foreground/70 hover:bg-sidebar-accent/60")}>
          <Search className="h-4 w-4" />
        </button>
        <QuickCreateButton compact />
        <div className="my-1.5 h-px w-8 bg-sidebar-border" />
        <Link href={NAV_HOME.href} title={NAV_HOME.label} aria-label={NAV_HOME.label} aria-current={pathname === "/" ? "page" : undefined} className={cn(iconButton, pathname === "/" ? "bg-primary/12 text-primary" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60")}>
          <NAV_HOME.icon className="h-4 w-4" />
        </Link>
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            title={g.label}
            aria-label={`Abrir ${g.label}`}
            onClick={() => { setOpenGroup(g.id); onExpand?.(); }}
            className={cn(iconButton, activeGroup === g.id ? "bg-primary/12 text-primary" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60")}
          >
            <g.icon className="h-4 w-4" />
          </button>
        ))}
        <div className="mt-auto flex flex-col items-center gap-1 pt-3">
          {globals.map((item) => {
            const active = isNavActive(pathname, item);
            return (
              <Link key={item.href} href={item.href} title={item.label} aria-label={item.label} aria-current={active ? "page" : undefined} className={cn(iconButton, active ? "bg-primary/12 text-primary" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60")}>
                <item.icon className="h-4 w-4" />
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 pb-2 pt-1">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sidebar-foreground/50" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
            onKeyDown={onSearchKey}
            placeholder="Buscar página..."
            aria-label="Buscar página"
            aria-controls={resultsId}
            aria-expanded={searching}
            role="combobox"
            autoComplete="off"
            enterKeyHint="go"
            className="h-11 w-full rounded-xl border border-sidebar-border bg-sidebar-accent/30 pl-9 pr-9 text-base text-sidebar-foreground placeholder:text-sidebar-foreground/45 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30 lg:h-9 lg:rounded-md lg:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {searching && (
            <button type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="Limpar busca" className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground lg:h-7 lg:w-7">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <QuickCreateButton onNavigate={onNavigate} />
      </div>

      {searching ? (
        <div id={resultsId} role="listbox" aria-label="Páginas encontradas" className="min-h-0 flex-1 overflow-y-auto px-3 pb-8 no-scrollbar">
          {results.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-sidebar-foreground/60">Nenhuma página encontrada para “{query.trim()}”.</p>
          ) : (
            <ul className="flex flex-col gap-0.5 pt-1">
              {results.map((r, i) => (
                <li key={r.key}>
                  <Link
                    href={r.href}
                    role="option"
                    aria-selected={i === highlight}
                    onClick={() => { setQuery(""); onNavigate?.(); }}
                    onMouseEnter={() => setHighlight(i)}
                    className={cn(rowBase, "items-start", i === highlight ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60")}
                  >
                    <r.icon className={cn(iconBase, "mt-0.5 text-primary")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{r.label}</span>
                      {r.path.length > 0 && <span className="block truncate text-xs font-normal text-sidebar-foreground/55">{navPathLabel(r)}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <nav aria-label="Menu principal" className="flex min-h-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 pb-6 pt-1 no-scrollbar">
          <NavLink item={NAV_HOME} onNavigate={onNavigate} />
          {groups.map((group) => (
            <GroupSection
              key={group.id}
              group={group}
              open={openGroup === group.id}
              onToggle={() => setOpenGroup((cur) => (cur === group.id ? null : group.id))}
              openSubmenus={openSubmenus}
              toggleSubmenu={toggleSubmenu}
              onNavigate={onNavigate}
            />
          ))}
          <div className="mt-auto flex flex-col gap-0.5 border-t border-sidebar-border pt-3">
            {globals.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
