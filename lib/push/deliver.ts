import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_DELIVERY_ATTEMPTS } from "@/lib/push/reminders";

/**
 * Entrega de lembretes por Web Push — o MESMO caminho para lembretes de
 * tarefas, subtarefas, rotina, prazos e atrasos.
 *
 * Estados em `push_delivery_log` (um por usuário + event_key):
 *   sending          → trava obtida, envio em andamento;
 *   sent             → ACEITO pelo serviço de push (Apple/Google/Mozilla).
 *                      Não prova que o aparelho exibiu;
 *   failed           → nenhum aparelho aceitou; nova tentativa na próxima
 *                      execução (até MAX_DELIVERY_ATTEMPTS, dentro da janela);
 *   no_subscription  → o usuário não tem aparelho inscrito.
 * Execuções repetidas/simultâneas do cron nunca enviam o mesmo aviso duas
 * vezes: a linha é criada ANTES do envio (unique user_id + event_key).
 */
export type Outgoing = { userId: string; eventKey: string; url: string; title: string; body: string };
type PushSubscriptionJSON = { endpoint: string; keys?: Record<string, string> };
export type PushSender = (subscription: PushSubscriptionJSON, payload: string) => Promise<unknown>;

export type DeliverySummary = {
  due: number;
  /** Lembretes aceitos pelo serviço de push (ao menos um aparelho). */
  accepted: number;
  /** Pushes aceitos (um por aparelho). */
  sent: number;
  failed: number;
  skipped: number;
  noSubscription: number;
  retried: number;
  expiredSubscriptions: number;
  errors: Array<{ eventKey: string; reason: string }>;
};

/** "Enviando" parado há mais que isso (processo caiu no meio) pode ser retomado. */
export const STUCK_SENDING_MS = 5 * 60_000;

type LogRow = { status?: string | null; attempts?: number | null; updated_at?: string | null };
const isMissingColumn = (code?: string) => code === "42703" || code === "PGRST204";

/** Motivo legível e seguro (sem endpoint, chaves ou tokens). */
export function describePushError(e: unknown): { status: number; reason: string; expired: boolean } {
  const status = typeof e === "object" && e && "statusCode" in e ? Number((e as { statusCode: unknown }).statusCode) || 0 : 0;
  const body = typeof e === "object" && e && "body" in e ? String((e as { body: unknown }).body ?? "") : "";
  const message = e instanceof Error ? e.message : String(e);
  const expired = status === 404 || status === 410;
  const hint = expired ? "inscrição expirada ou removida no aparelho"
    : status === 403 ? "chave VAPID recusada pelo serviço (confira as chaves na Vercel)"
    : status === 413 ? "conteúdo grande demais"
    : status === 429 ? "limite de envios do serviço — nova tentativa depois"
    : status >= 500 ? "serviço de push indisponível — nova tentativa depois"
    : status === 0 ? "erro de rede ou de configuração" : "recusado pelo serviço";
  const detail = (body || message).replace(/https?:\/\/\S+/g, "[url]").replace(/\s+/g, " ").slice(0, 160);
  return { status, expired, reason: `${status || "rede"} · ${hint}${detail ? ` (${detail})` : ""}` };
}

async function acquire(db: SupabaseClient, r: Outgoing, now: number): Promise<"tracked" | "legacy" | "retry" | null> {
  const tracked = await db.from("push_delivery_log").insert({ user_id: r.userId, event_key: r.eventKey, status: "sending", attempts: 1 });
  if (!tracked.error) return "tracked";
  if (isMissingColumn(tracked.error.code)) {
    const legacy = await db.from("push_delivery_log").insert({ user_id: r.userId, event_key: r.eventKey });
    if (!legacy.error) return "legacy";
    if (legacy.error.code === "23505") return null;
    throw legacy.error;
  }
  if (tracked.error.code !== "23505") throw tracked.error;

  const { data, error } = await db.from("push_delivery_log").select("status,attempts,updated_at").eq("user_id", r.userId).eq("event_key", r.eventKey).maybeSingle();
  if (error) throw error;
  const row = data as LogRow | null;
  const attempts = Number(row?.attempts ?? 0);
  if (attempts >= MAX_DELIVERY_ATTEMPTS) return null;
  const stuck = row?.status === "sending" && !!row.updated_at && now - Date.parse(row.updated_at) > STUCK_SENDING_MS;
  if (row?.status !== "failed" && !stuck) return null;
  // Atualização condicional: só um processo concorrente vence a nova tentativa.
  const retry = await db.from("push_delivery_log")
    .update({ status: "sending", attempts: attempts + 1, updated_at: new Date(now).toISOString() })
    .eq("user_id", r.userId).eq("event_key", r.eventKey).eq("status", row!.status!).eq("attempts", attempts)
    .select("id");
  if (retry.error) throw retry.error;
  return retry.data?.length ? "retry" : null;
}

async function finish(db: SupabaseClient, mode: "tracked" | "legacy" | "retry", r: Outgoing, result: { status: "sent" | "failed" | "no_subscription"; error?: string; sent: number }) {
  const log = db.from("push_delivery_log");
  if (mode === "legacy") {
    if (result.status === "failed") await log.delete().eq("user_id", r.userId).eq("event_key", r.eventKey);
    return;
  }
  const now = new Date().toISOString();
  await log.update({
    status: result.status,
    last_error: result.error?.slice(0, 500) ?? null,
    sent_count: result.sent,
    sent_at: result.status === "sent" ? now : null,
    updated_at: now,
  }).eq("user_id", r.userId).eq("event_key", r.eventKey);
}

export async function deliverReminders(db: SupabaseClient, due: Outgoing[], send: PushSender, now = Date.now()): Promise<DeliverySummary> {
  const s: DeliverySummary = { due: due.length, accepted: 0, sent: 0, failed: 0, skipped: 0, noSubscription: 0, retried: 0, expiredSubscriptions: 0, errors: [] };
  for (const r of due) {
    const mode = await acquire(db, r, now);
    if (!mode) { s.skipped++; continue; }
    if (mode === "retry") s.retried++;

    // Somente as inscrições do DONO do lembrete — nunca de outro usuário.
    const { data: rows, error } = await db.from("push_subscriptions").select("user_id,endpoint,subscription").eq("user_id", r.userId);
    if (error) throw error;
    const subs = (rows ?? []) as Array<{ user_id: string; endpoint: string; subscription: PushSubscriptionJSON }>;
    if (!subs.length) {
      s.noSubscription++;
      await finish(db, mode, r, { status: "no_subscription", sent: 0 });
      continue;
    }

    let sent = 0;
    const reasons: string[] = [];
    const payload = JSON.stringify({ title: r.title, body: r.body, url: r.url, tag: r.eventKey });
    for (const sub of subs) {
      try {
        await send(sub.subscription, payload);
        sent++;
      } catch (e) {
        const err = describePushError(e);
        if (err.expired) {
          s.expiredSubscriptions++;
          await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint).eq("user_id", r.userId);
        }
        reasons.push(err.reason);
      }
    }
    if (sent) { s.sent += sent; s.accepted++; } else s.failed++;
    if (reasons.length) s.errors.push({ eventKey: r.eventKey, reason: reasons.join(" | ").slice(0, 300) });
    await finish(db, mode, r, { status: sent ? "sent" : "failed", error: reasons.join(" | ") || undefined, sent });
  }
  return s;
}
