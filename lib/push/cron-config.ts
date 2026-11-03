import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Agendamento dos lembretes (Supabase Cron → pg_net → /api/cron/task-reminders).
 *
 * O pg_cron precisa da URL de produção e de um segredo no Vault. Antes isso
 * era um passo manual que nunca foi feito; agora o próprio servidor de
 * PRODUÇÃO grava os dois (RPC `vsplanner_configure_cron`, só service role),
 * usando o domínio de produção da Vercel e o CRON_SECRET. Nada de segredo
 * no repositório, em logs ou em respostas.
 */

const ENSURE_EVERY_MS = 10 * 60_000;
let lastEnsure = 0;

/** URL de produção (https://dominio) — só em produção; preview/local nunca reconfiguram. */
export function productionAppUrl(requestUrl?: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.VERCEL_ENV !== "production") return null;
  const host = env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (host) return `https://${host}`;
  if (requestUrl) {
    const u = new URL(requestUrl);
    if (u.protocol === "https:") return u.origin;
  }
  return null;
}

export type EnsureResult = { ok: boolean; skipped?: string; changes?: Record<string, string>; error?: string };

const missingFunction = (e: { code?: string; message?: string }) => e.code === "PGRST202" || e.code === "42883" || /function .* does not exist|Could not find the function/i.test(e.message ?? "");

/** Garante URL + segredo no Vault e o job ativo. Idempotente; no máximo a cada 10 min por instância. */
export async function ensureCronConfigured(db: SupabaseClient, requestUrl?: string, opts: { force?: boolean; env?: NodeJS.ProcessEnv } = {}): Promise<EnsureResult> {
  const env = opts.env ?? process.env;
  const url = productionAppUrl(requestUrl, env);
  if (!url) return { ok: false, skipped: "fora da produção" };
  if (!opts.force && Date.now() - lastEnsure < ENSURE_EVERY_MS) return { ok: true, skipped: "configurado há pouco" };
  const { data, error } = await db.rpc("vsplanner_configure_cron", { p_url: url, p_secret: env.CRON_SECRET || null });
  if (error) {
    const msg = missingFunction(error) ? "migração 20261104100000_push_cron_selfheal.sql pendente no Supabase" : error.message;
    console.error("Cron self-config failed", { reason: msg });
    return { ok: false, error: msg };
  }
  lastEnsure = Date.now();
  const changes = (data ?? {}) as Record<string, string>;
  if (Object.values(changes).some((v) => v !== "ok")) console.info("Cron self-config", changes);
  return { ok: true, changes };
}

/** Para testes. */
export function resetEnsureCache() { lastEnsure = 0; }

export type CronCaller = "vercel-cron" | "supabase-cron" | "manual";

/**
 * Quem pode chamar a rota: Bearer igual ao CRON_SECRET da Vercel, ou igual ao
 * segredo do Vault (conferido no banco, sem ler o valor). Devolve a origem
 * para o diagnóstico, ou null se não autorizado.
 */
export async function authorizeCronRequest(db: () => SupabaseClient, request: Request, env: NodeJS.ProcessEnv = process.env): Promise<CronCaller | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token.length < 16) return null;
  const source = request.headers.get("x-vsplanner-source") === "supabase-cron" ? "supabase-cron"
    : /vercel-cron/i.test(request.headers.get("user-agent") ?? "") ? "vercel-cron" : "manual";
  if (env.CRON_SECRET && token === env.CRON_SECRET) return source;
  try {
    const { data, error } = await db().rpc("vsplanner_cron_check_token", { p_token: token });
    if (!error && data === true) return source;
  } catch { /* sem service role/migração: só o CRON_SECRET vale */ }
  return null;
}
