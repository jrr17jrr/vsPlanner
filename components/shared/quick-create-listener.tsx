"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { QuickCreateKind } from "@/lib/quick-create";

function Listener({ kinds, onOpen }: { kinds: QuickCreateKind[]; onOpen: (kind: QuickCreateKind) => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const novo = params.get("novo") as QuickCreateKind | null;
  const openRef = useRef(onOpen);
  useEffect(() => { openRef.current = onOpen; });

  useEffect(() => {
    if (!novo || !kinds.includes(novo)) return;
    openRef.current(novo);
    // Tira o ?novo= da URL para não reabrir ao atualizar/voltar.
    const rest = new URLSearchParams(params.toString());
    rest.delete("novo");
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novo]);

  return null;
}

/**
 * Abre o formulário JÁ existente da página quando a URL chega com
 * `?novo=<kind>` (botão "+ Novo" do menu). Funciona também quando a pessoa
 * já está na página (a URL muda e o efeito roda de novo).
 */
export function QuickCreateListener(props: { kinds: QuickCreateKind[]; onOpen: (kind: QuickCreateKind) => void }) {
  return (
    <Suspense fallback={null}>
      <Listener {...props} />
    </Suspense>
  );
}
