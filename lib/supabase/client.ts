"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database.types";

/**
 * Cliente Supabase para uso em Client Components ("use client").
 *
 * Fase 1 — ainda não é importado por nenhuma tela do app (o app continua
 * rodando sobre o mock/localStorage). Preparado para a Fase 2, quando o
 * login mock for substituído pelo Supabase Auth real.
 */
export function createSupabaseBrowserClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}
