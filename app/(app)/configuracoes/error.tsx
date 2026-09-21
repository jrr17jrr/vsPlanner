"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export default function ConfiguracoesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[configuracoes]", error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title="Não foi possível carregar as configurações"
      description="Houve uma falha ao conversar com o Supabase. Tente de novo em alguns instantes."
      action={
        <Button size="sm" onClick={() => reset()}>
          Tentar novamente
        </Button>
      }
    />
  );
}
