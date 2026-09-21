"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

/**
 * A autenticação e a identidade (real, Supabase) já foram resolvidas no
 * servidor antes deste componente renderizar (ver app/(app)/layout.tsx +
 * AuthProfileProvider) — o shell nunca depende de persona mock. Todos os
 * módulos (Visionário Dev, Financeiro, Rotina/Tarefas/Metas/Histórico/
 * Trabalho-CLT/Configurações, Vendedores, Sites) já são reais — não existe
 * mais persona/ponte mock em lugar nenhum do app.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
