import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { localDateTimeParts, selectDueReminders, type DueReminder } from "@/lib/push/reminders";
import { selectScheduledReminders } from "@/lib/push/schedule-reminders";
import { resolveNotificationPrefs } from "@/lib/notification-prefs";
import { loadLegacyCandidates, loadPreferences, loadScheduleSources } from "@/lib/push/reminder-sources";
import { deliverReminders, type Outgoing } from "@/lib/push/deliver";
import { authorizeCronRequest, ensureCronConfigured } from "@/lib/push/cron-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lembretes por Web Push. Chamada a cada minuto pelo Supabase Cron
 * (`pg_cron` + `pg_net`, migrations 20261103100000 e 20261104100000) e uma
 * vez por dia pelo cron da Vercel (reserva). O cron só AGENDA a verificação:
 * aqui o estado ATUAL das tarefas/subtarefas/rotina vira lembretes
 * (lib/push/schedule-reminders.ts) e a entrega é o Web Push (lib/push/deliver.ts),
 * só para os aparelhos do dono de cada lembrete.
 *
 * Cada execução fica registrada em `push_cron_runs` (horário, encontrados,
 * enviados ao serviço de push, falhas e motivos). Modos seguros (exigem o
 * mesmo token do cron): `?dry=1` mostra o que sairia agora sem enviar;
 * `?status=1` mostra a saúde do agendador sem valores de segredos.
 */

/** Tudo que deve sair agora (fluxo antigo de Trabalho/CLT + motor novo), já sem duplicatas. */
async function dueNow(db: SupabaseClient, now: Date) {
  const { date } = localDateTimeParts(now);
  const [{ tasks, occurrences }, sources] = await Promise.all([loadLegacyCandidates(db, date), loadScheduleSources(db, date)]);
  const userIds = [...new Set([
    ...tasks.map((t) => t.user_id), ...sources.tasks.map((t) => t.user_id),
    ...sources.subtasks.map((s) => s.user_id), ...sources.activities.map((a) => a.user_id),
  ])];
  const prefs = await loadPreferences(db, userIds);
  const legacy: Outgoing[] = selectDueReminders({ now, tasks, occurrences, preferences: prefs.legacy }).map((r: DueReminder) => ({
    userId: r.userId, eventKey: r.eventKey, url: r.url, title: "VS Planner • Lembrete de tarefa", body: `${r.time} · ${r.title}`,
  }));
  const scheduled: Outgoing[] = selectScheduledReminders({
    now, ...sources, prefs: (userId) => prefs.resolved.get(userId) ?? resolveNotificationPrefs(null),
  }).map((r) => ({ userId: r.userId, eventKey: r.eventKey, url: r.url, title: r.title, body: r.body }));
  const keys = new Set<string>();
  const due = [...legacy, ...scheduled].filter((r) => !keys.has(`${r.userId}|${r.eventKey}`) && !!keys.add(`${r.userId}|${r.eventKey}`));
  return { due, candidates: tasks.length + sources.tasks.length + sources.subtasks.length + sources.activities.length };
}

async function recordRun(db: SupabaseClient, row: Record<string, unknown>, now: Date) {
  const { error } = await db.from("push_cron_runs").insert(row);
  // Sem a migration 20261104100000 a tabela não existe: o envio segue normal.
  if (error && !["42P01", "PGRST205"].includes(String(error.code))) console.error("push_cron_runs insert", error.message);
  // Mantém 7 dias de histórico (limpeza 1x por hora).
  if (!error && now.getUTCMinutes() === 0) await db.from("push_cron_runs").delete().lt("ran_at", new Date(now.getTime() - 7 * 86_400_000).toISOString());
}

export async function GET(request: Request) {
  let db: SupabaseClient | null = null;
  const admin = () => (db ??= getSupabaseAdminClient() as unknown as SupabaseClient);
  const source = await authorizeCronRequest(admin, request);
  if (!source) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const started = Date.now();
  const now = new Date();
  const { date, time } = localDateTimeParts(now);

  // Toda chamada autorizada em produção garante o agendamento (URL/segredo no Vault, job ativo).
  const config = await ensureCronConfigured(admin(), request.url);

  if (params.get("status") === "1") {
    const status = await admin().rpc("vsplanner_cron_status");
    const runs = await admin().from("push_cron_runs").select("ran_at,source,local_time,candidates,due,sent,failed,skipped,no_subscription,retried,errors").order("ran_at", { ascending: false }).limit(10);
    return NextResponse.json({ ok: true, now: `${date} ${time}`, timeZone: "America/Sao_Paulo", caller: source, config, scheduler: status.error ? { error: status.error.message } : status.data, recentRuns: runs.error ? { error: runs.error.message } : runs.data });
  }

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    await recordRun(admin(), { source, local_time: `${date} ${time}`, errors: [{ eventKey: "-", reason: "VAPID não configurado na Vercel" }] }, now);
    return NextResponse.json({ error: "VAPID not configured" }, { status: 503 });
  }

  try {
    const { due, candidates } = await dueNow(admin(), now);
    if (params.get("dry") === "1") {
      return NextResponse.json({ ok: true, dryRun: true, date, time, candidates, due: due.length, reminders: due.map(({ eventKey, title, body, url }) => ({ eventKey, title, body, url })) });
    }
    webpush.setVapidDetails("mailto:admin@visionariodev.com.br", pub, priv);
    const delivery = await deliverReminders(admin(), due, (subscription, payload) =>
      webpush.sendNotification(subscription as webpush.PushSubscription, payload, { TTL: 60 * 60, urgency: "high" }));
    const summary = { ok: true, source, date, time, candidates, ...delivery, durationMs: Date.now() - started };
    if (delivery.errors.length) console.error("Task reminder delivery errors", delivery.errors);
    console.info("Task reminder run", { ...summary, errors: delivery.errors.length });
    await recordRun(admin(), {
      source, local_time: `${date} ${time}`, candidates, due: delivery.due, sent: delivery.sent, failed: delivery.failed,
      skipped: delivery.skipped, no_subscription: delivery.noSubscription, retried: delivery.retried, duration_ms: summary.durationMs,
      errors: delivery.errors.slice(0, 20),
    }, now);
    return NextResponse.json({ ...summary, config: config.ok ? undefined : config });
  } catch (e) {
    const reason = e instanceof Error ? e.message.slice(0, 300) : "erro desconhecido";
    console.error("Task reminder cron failed", reason);
    await recordRun(admin(), { source, local_time: `${date} ${time}`, duration_ms: Date.now() - started, errors: [{ eventKey: "-", reason }] }, now).catch(() => undefined);
    return NextResponse.json({ error: "Task reminder processing failed" }, { status: 500 });
  }
}
