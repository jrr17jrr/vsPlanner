import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database.types";

/**
 * Cliente Supabase para uso em Server Components, Server Actions e Route
 * Handlers (App Router). Usa `cookies()` (assíncrono no Next.js 16) para
 * ler/gravar a sessão via cookies HTTP-only.
 *
 * Fase 1 — ainda não é importado por nenhuma tela do app. Preparado para a
 * Fase 2. `setAll` pode falhar quando chamado a partir de um Server
 * Component puro (sem Server Action/Route Handler); isso é esperado e
 * inofensivo caso a renovação de sessão também aconteça no `proxy.ts` da
 * Fase 2 — por isso o catch fica silencioso aqui.
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Chamado de um Server Component sem permissão de escrita em
          // cookies — sem problema se a sessão também for renovada pelo
          // proxy.ts (Fase 2).
        }
      },
    },
  });
}
