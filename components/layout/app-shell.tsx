"use client";

import { useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useAuth } from "@/hooks/use-auth";
import { useSessionStore } from "@/store/session-store";
import { USER_RICARDO } from "@/mock/ids";

export function AppShell({ children }: { children: React.ReactNode }) {
  // A autenticação real já foi validada no servidor (ver
  // app/(app)/layout.tsx) antes deste componente renderizar. `profile` e
  // `personalSpace` aqui são o profile/space MOCK (store/db-store.ts) —
  // ainda usados por rotina/tarefas/trabalho/financeiro/etc, que não foram
  // migrados nesta fase (só a autenticação foi).
  const { profile, personalSpace } = useAuth();
  const mockUserId = useSessionStore((s) => s.userId);
  const mockLogin = useSessionStore((s) => s.login);

  useEffect(() => {
    // Ainda não existe uma persona mock por usuário Supabase, então todo
    // usuário real autenticado usa a persona mock padrão (Ricardo) para que
    // os módulos não migrados continuem funcionando como estão (pedido
    // explícito desta fase). Revisar quando esses módulos migrarem.
    if (!mockUserId) {
      mockLogin(USER_RICARDO);
    }
  }, [mockUserId, mockLogin]);

  if (!profile || !personalSpace) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

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
