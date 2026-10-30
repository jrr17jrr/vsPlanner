import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database.types";

/**
 * Checagem OTIMISTA de sessão (Fase 2) — roda em toda navegação, então só
 * lê a sessão (via `auth.getUser()`, que também renova o token quando
 * necessário) e redireciona. Não faz checagem de `status`/`system_role`
 * aqui (isso fica para `lib/supabase/dal.ts`, mais perto dos dados) —
 * evita consultas extras em toda requisição, incluindo navegação
 * pré-carregada. Ver node_modules/next/dist/docs/01-app/02-guides/authentication.md.
 */

const PUBLIC_ROUTES = new Set(["/login"]);
const PUBLIC_PWA_ROUTES = new Set(["/icon", "/apple-icon", "/manifest.webmanifest", "/favicon.ico", "/sw.js"]);

export async function proxy(request: NextRequest) {
  // iOS/Safari busca os ícones sem cookies de autenticação.
  // Nunca redirecionar assets PWA para /login.
  if (PUBLIC_PWA_ROUTES.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Rotas de cron não têm cookie de sessão (chamadas pelo Supabase Cron /
  // Vercel Cron) e se autenticam com `Authorization: Bearer CRON_SECRET`
  // dentro da própria rota. Sem isto, eram redirecionadas para /login.
  if (request.nextUrl.pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  const { url, anonKey } = getSupabaseEnv();

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
        Object.entries(headers).forEach(([key, value]) =>
          supabaseResponse.headers.set(key, value)
        );
      },
    },
  });

  // IMPORTANTE: não rodar nenhuma lógica entre `createServerClient` e
  // `getUser()` — é o que dispara a renovação do token e a gravação dos
  // cookies atualizados via `setAll` acima.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicRoute = PUBLIC_ROUTES.has(pathname);

  // Falha de REDE/5xx ao validar ou renovar a sessão (ex.: iPhone saindo do
  // modo de espera com a conexão ainda voltando) não significa sessão
  // inválida: o auth-js mantém os cookies nesse caso. Redirecionar para
  // /login aqui era uma das causas de "pedir login de novo" no PWA. Deixa
  // passar — o DAL mostra a tela de erro com "Tentar novamente".
  if (!user && error && isAuthRetryableFetchError(error)) {
    return supabaseResponse;
  }

  if (!user && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  if (user && isPublicRoute) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/hoje";
    return NextResponse.redirect(homeUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon(?:/|$)|apple-icon(?:/|$)|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
