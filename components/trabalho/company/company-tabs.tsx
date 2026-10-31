"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { LayoutDashboard, ListChecks, Megaphone, Users, Wallet } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const COMPANY_TABS = [
  { id: "visao-geral", label: "Visão Geral", icon: LayoutDashboard },
  { id: "campanhas", label: "Campanhas", icon: Megaphone },
  { id: "publicos", label: "Públicos", icon: Users },
  { id: "tarefas", label: "Tarefas", icon: ListChecks },
  { id: "financeiro", label: "Financeiro", icon: Wallet },
] as const;
export type CompanyTabId = (typeof COMPANY_TABS)[number]["id"];

export const isCompanyTab = (v: unknown): v is CompanyTabId => COMPANY_TABS.some(t => t.id === v);

const TabContext = createContext<(tab: CompanyTabId) => void>(() => {});
/** Troca de aba a partir de qualquer componente dentro da página da empresa. */
export const useCompanyTab = () => useContext(TabContext);

/**
 * Abas da página da empresa. A troca é só no cliente (sem recarregar) e a aba
 * fica na URL (`?aba=`), para recarregar/compartilhar na mesma aba.
 */
export function CompanyTabs({ initialTab, panels }: { initialTab: CompanyTabId; panels: Record<CompanyTabId, ReactNode> }) {
  const [tab, setTabState] = useState<CompanyTabId>(initialTab);
  const listRef = useRef<HTMLDivElement>(null);

  const setTab = useCallback((next: CompanyTabId) => {
    setTabState(next);
    const url = new URL(window.location.href);
    if (next === "visao-geral") url.searchParams.delete("aba");
    else url.searchParams.set("aba", next);
    window.history.replaceState(window.history.state, "", url);
    // Vindo de um botão no fim da Visão Geral: volta o foco visual para as abas.
    const el = listRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <TabContext.Provider value={setTab}>
      <Tabs value={tab} onValueChange={v => isCompanyTab(v) && setTab(v)}>
        <div ref={listRef} aria-hidden="true" />
        <div className="sticky top-0 z-20 -mx-4 border-b bg-background/90 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:mx-0 sm:rounded-xl sm:border sm:px-2">
          <TabsList aria-label="Seções da empresa" className="h-auto w-full justify-start gap-1 bg-transparent p-0">
            {COMPANY_TABS.map(t => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="min-h-11 shrink-0 gap-2 rounded-lg px-3 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:ring-1 data-[state=active]:ring-primary/40 sm:flex-1"
              >
                <t.icon className="h-4 w-4" aria-hidden="true" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {COMPANY_TABS.map(t => (
          <TabsContent key={t.id} value={t.id} className="mt-4 space-y-4 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200">
            {panels[t.id]}
          </TabsContent>
        ))}
      </Tabs>
    </TabContext.Provider>
  );
}

/** Botão/link que abre outra aba da empresa. */
export function OpenTabButton({ tab, children, className }: { tab: CompanyTabId; children: ReactNode; className?: string }) {
  const setTab = useCompanyTab();
  return <button type="button" onClick={() => setTab(tab)} className={className ?? "inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary hover:underline"}>{children}</button>;
}
