"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Users, Briefcase, CalendarClock, Layers, Compass, Loader2 } from "lucide-react";
import { useAuthProfile } from "@/components/providers/auth-profile-provider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchAction, type SearchResult, type SearchResultGroup } from "@/lib/supabase/search-actions";
import { NAV_HOME, NAV_GROUPS, NAV_DEV_PANEL } from "@/lib/nav";

const GROUP_ICON: Record<SearchResultGroup | "Páginas", typeof Search> = {
  Clientes: Users,
  Serviços: Layers,
  Reuniões: CalendarClock,
  Trabalhos: Briefcase,
  Páginas: Compass,
};

type PageResult = { id: string; label: string; href: string; group: "Páginas" };

/**
 * Busca real: clientes/serviços/reuniões/trabalhos vêm de
 * `searchAction()` (server, filtrado por space + permissão de módulo —
 * nunca mock, nunca de outro space). Páginas/módulos são filtrados
 * localmente contra o menu real (`canAccessVisionario`/`canAccessTiktok`
 * do contexto real) — nunca mostra um link pra uma página que o usuário
 * não pode acessar.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dataResults, setDataResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { canAccessVisionario, canAccessTiktok, visionarioModulePermissions, tiktokModulePermissions, profile } = useAuthProfile();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;

    const timeout = setTimeout(() => {
      setLoading(true);
      searchAction(q)
        .then((results) => setDataResults(results))
        .catch((error) => {
          console.error("[busca] falha ao buscar", error);
          toast.error("Não foi possível buscar agora.");
          setDataResults([]);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timeout);
  }, [query]);

  const pageResults = useMemo<PageResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const accessible = [NAV_HOME, ...NAV_GROUPS.flatMap((g) => {
      if (g.requires === "visionario" && !canAccessVisionario) return [];
      if (g.requires === "tiktok" && !canAccessTiktok) return [];
      const permissions = g.requires === "visionario" ? visionarioModulePermissions : g.requires === "tiktok" ? tiktokModulePermissions : undefined;
      return permissions ? g.items.filter((item) => !item.module || permissions[item.module]) : g.items;
    })];
    if (profile.system_role === "super_admin") accessible.push(NAV_DEV_PANEL);
    return accessible
      .filter((item) => item.label.toLowerCase().includes(q))
      .map((item) => ({ id: item.href, label: item.label, href: item.href, group: "Páginas" as const }));
  }, [query, canAccessVisionario, canAccessTiktok, visionarioModulePermissions, tiktokModulePermissions, profile.system_role]);

  const hasQuery = query.trim().length >= 2;
  // `dataResults` pode ser resíduo de uma busca anterior mais longa — só
  // conta enquanto a query atual ainda é válida (>= 2 caracteres), sem
  // precisar "limpar" o state num efeito.
  const effectiveDataResults = useMemo(() => (hasQuery ? dataResults : []), [hasQuery, dataResults]);

  const groups: Array<[string, Array<SearchResult | PageResult>]> = useMemo(() => {
    const byGroup = new Map<string, Array<SearchResult | PageResult>>();
    for (const r of [...pageResults, ...effectiveDataResults]) {
      const list = byGroup.get(r.group) ?? [];
      list.push(r);
      byGroup.set(r.group, list);
    }
    return Array.from(byGroup.entries());
  }, [pageResults, effectiveDataResults]);

  const totalResults = pageResults.length + effectiveDataResults.length;

  function go(href: string) {
    router.push(href);
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden text-muted-foreground sm:flex sm:w-56 sm:justify-start sm:gap-2"
      >
        <Search className="h-3.5 w-3.5" />
        Buscar…
      </Button>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} className="sm:hidden">
        <Search className="h-4.5 w-4.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-24 translate-y-0 gap-3 sm:max-w-md" showClose={false}>
          <DialogHeader>
            <DialogTitle className="sr-only">Busca global</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border border-input bg-secondary/40 px-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar clientes, reuniões, trabalhos, serviços, páginas…"
              className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
            {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {hasQuery && !loading && totalResults === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum resultado para &quot;{query}&quot;.
              </p>
            )}
            {groups.map(([group, items]) => {
              const Icon = GROUP_ICON[group as SearchResultGroup | "Páginas"] ?? Search;
              return (
                <div key={group} className="mb-1">
                  <p className="px-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
                  {items.map((r) => (
                    <button
                      key={`${group}-${r.id}`}
                      onClick={() => go(r.href)}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-secondary/60"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{r.label}</span>
                      {"sub" in r && r.sub && <span className="text-xs text-muted-foreground">{r.sub}</span>}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
