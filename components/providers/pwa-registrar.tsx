"use client";

import { useEffect } from "react";
import { registerServiceWorker, syncSubscription } from "@/lib/push/client";

/**
 * Registra/atualiza o Service Worker ao abrir o app e ressincroniza a
 * inscrição push deste aparelho com o usuário logado. Não renderiza nada.
 */
export function PwaRegistrar() {
  useEffect(() => {
    registerServiceWorker()
      .then(() => syncSubscription())
      .catch(() => undefined);
  }, []);
  return null;
}
