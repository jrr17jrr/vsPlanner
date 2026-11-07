"use client";

import { useCallback, useEffect, useState } from "react";
import { listMyPersonalAccountsAction, type PersonalCategoryOption } from "@/lib/supabase/financial-personal-link-actions";
import type { FinancialScope } from "@/lib/space-slugs";
import type { PersonalAccountOption } from "@/types/database.types";

type State = { loaded: boolean; allowed: boolean; accounts: PersonalAccountOption[]; categories: PersonalCategoryOption[]; error?: string };

/**
 * Contas (com saldo) e categorias de despesa do Financeiro Pessoal de quem
 * está logado, carregadas só quando necessário (`enabled`) — ex.: "Quem
 * pagou: Ricardo Júnior".
 */
export function usePersonalAccounts(scope: FinancialScope, enabled: boolean) {
  const [state, setState] = useState<State>({ loaded: false, allowed: false, accounts: [], categories: [] });

  useEffect(() => {
    if (!enabled || state.loaded || scope === "pessoal") return;
    let cancelled = false;
    listMyPersonalAccountsAction(scope)
      .then((r) => !cancelled && setState({ loaded: true, allowed: r.allowed, accounts: r.accounts, categories: r.categories ?? [], error: r.error }))
      .catch(() => !cancelled && setState({ loaded: true, allowed: false, accounts: [], categories: [], error: "Não foi possível carregar as contas pessoais." }));
    return () => {
      cancelled = true;
    };
  }, [enabled, scope, state.loaded]);

  /** Categoria recém-criada entra na lista sem recarregar. */
  const addCategory = useCallback((c: PersonalCategoryOption) => {
    setState((s) => (s.categories.some((x) => x.id === c.id) ? s : { ...s, categories: [...s.categories, c].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) }));
  }, []);

  return { ...state, addCategory, loading: enabled && !state.loaded && scope !== "pessoal" };
}
