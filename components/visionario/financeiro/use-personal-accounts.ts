"use client";

import { useEffect, useState } from "react";
import { listMyPersonalAccountsAction } from "@/lib/supabase/financial-personal-link-actions";
import type { FinancialScope } from "@/lib/space-slugs";
import type { PersonalAccountOption } from "@/types/database.types";

/**
 * Contas do Financeiro Pessoal de quem está logado (com saldo), carregadas
 * só quando necessário (`enabled`) — ex.: "Quem pagou: Ricardo Júnior".
 */
export function usePersonalAccounts(scope: FinancialScope, enabled: boolean) {
  const [state, setState] = useState<{ loaded: boolean; allowed: boolean; accounts: PersonalAccountOption[]; error?: string }>({
    loaded: false,
    allowed: false,
    accounts: [],
  });

  useEffect(() => {
    if (!enabled || state.loaded || scope === "pessoal") return;
    let cancelled = false;
    listMyPersonalAccountsAction(scope)
      .then((r) => !cancelled && setState({ loaded: true, allowed: r.allowed, accounts: r.accounts, error: r.error }))
      .catch(() => !cancelled && setState({ loaded: true, allowed: false, accounts: [], error: "Não foi possível carregar as contas pessoais." }));
    return () => {
      cancelled = true;
    };
  }, [enabled, scope, state.loaded]);

  return { ...state, loading: enabled && !state.loaded && scope !== "pessoal" };
}
