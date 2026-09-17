"use client";

import { useEffect, useState } from "react";
import { useDbStore } from "@/store/db-store";
import { useSessionStore } from "@/store/session-store";

/**
 * Garante que o app só renderize dados de localStorage depois da hidratação
 * do client, evitando divergência entre o HTML gerado no servidor e o
 * primeiro paint no navegador (persist middleware do Zustand usa
 * `skipHydration` justamente para isso).
 */
export function HydrationGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([
      useDbStore.persist.rehydrate(),
      useSessionStore.persist.rehydrate(),
    ]).finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Carregando VSPlanner…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
