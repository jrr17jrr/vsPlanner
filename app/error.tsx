"use client";

import { useEffect } from "react";

/**
 * Cobre erros em segmentos que `app/(app)/error.tsx` NÃO cobre — em
 * particular `app/(app)/layout.tsx` (um error.tsx nunca protege o
 * layout.tsx do MESMO segmento, só layouts/páginas abaixo dele; ver
 * node_modules/next/dist/docs/.../error.md). Antes deste arquivo, um erro
 * no layout autenticado (ex.: notificações, permissão por módulo, bootstrap
 * de space) não tinha NENHUM boundary — caía direto na tela genérica do
 * Next.js ("This page couldn't load"), sem log nenhum daqui. Isso por si só
 * não corrige a causa raiz, mas é o que garante que ela fique visível
 * (console.error) em vez de invisível.
 */
export default function RootSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-root]", error);
  }, [error]);

  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <p className="text-lg font-semibold text-foreground">Algo deu errado</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Houve uma falha ao carregar o VSPlanner. Tente de novo — se persistir, avise o administrador.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Tentar novamente
      </button>
    </div>
  );
}
