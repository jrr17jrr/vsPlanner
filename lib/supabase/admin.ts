import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Client Supabase com a Service Role — só existe no servidor.
 * `import "server-only"` faz o build falhar se algum Client Component
 * importar este arquivo, mesmo por engano/transitivamente.
 *
 * Nunca ler `SUPABASE_SERVICE_ROLE_KEY` no topo do módulo: isso faria
 * qualquer import deste arquivo (ex: durante `next build`, mesmo sem a
 * função ser chamada) explodir em ambientes sem a variável — é o caso do
 * ambiente local deste projeto, de propósito (a chave só existe na
 * Vercel). Lida sob demanda, só quando uma action realmente precisa dela.
 *
 * `createClient` aqui é o do `@supabase/supabase-js` puro (não o
 * `@supabase/ssr`): este client não representa uma sessão de usuário via
 * cookies, então `persistSession`/`autoRefreshToken` ficam desligados.
 */
export function getSupabaseAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não está configurada neste ambiente. " +
        "Esta ação administrativa só funciona onde a Service Role foi definida " +
        "(hoje: só na Vercel, de propósito — nunca em .env.local)."
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
