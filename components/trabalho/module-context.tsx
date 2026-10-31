"use client";

import { createContext, useContext } from "react";
import { MODULES, type CltModule, type CltModuleConfig } from "@/lib/clt/module";

const Ctx = createContext<CltModuleConfig>(MODULES.clt);

/**
 * Define o módulo (CLT ou MKT) das telas compartilhadas. Sem provider, tudo
 * continua sendo o Trabalho / CLT (rotas e textos atuais, sem mudança).
 */
export function CltModuleProvider({ module, children }: { module: CltModule; children: React.ReactNode }) {
  return <Ctx.Provider value={MODULES[module]}>{children}</Ctx.Provider>;
}

export function useCltModule(): CltModuleConfig {
  return useContext(Ctx);
}
