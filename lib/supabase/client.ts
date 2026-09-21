"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database.types";

/**
 * Cliente Supabase para uso em Client Components ("use client").
 *
 * Nenhuma tela usa isto hoje — toda leitura/escrita passa por Server
 * Components/Server Actions (`lib/supabase/server.ts`). Fica preparado
 * caso algum fluxo precise rodar direto no navegador (ex.: realtime).
 */
export function createSupabaseBrowserClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}
