import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  MAX_DELIVERY_ATTEMPTS,
  localDateTimeParts,
  selectDueReminders,
  type DueReminder,
  type ReminderOccurrence,
  type ReminderPreferences,
  type ReminderTable,
  type ReminderTask,
} from "@/lib/push/reminders";
import webpush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lembretes de tarefas. Disparado a cada minuto pelo Supabase Cron
 * (`pg_cron` + `pg_net`, ver supabase/cron/task_reminders.sql) e uma vez por
 * dia pelo cron da Vercel (fallback). O cron só AGENDA a verificação — quem
 * entrega é o Web Push (VAPID) para as inscrições do próprio dono da tarefa.
 *
 * Deduplicação: `push_delivery_log (user_id, event_key)` é único; a linha é
 * criada ANTES do envio (trava). Com a migration 20261030_push_delivery_status
 * aplicada, falhas ficam registradas (`status = failed`, `last_error`) e são
 * re-tentadas até MAX_DELIVERY_ATTEMPTS dentro da janela de recuperação.
 * Sem ela, mantém o comportamento antigo (apaga a trava para tentar de novo).
 */

type Subscription = { user_id: string; endpoint: string; subscription: webpush.PushSubscription };
type LogRow = { status?: string | null; attempts?: number | null };

const TABLES: ReminderTable[] = ["tasks", "personal_work_tasks", "clt_tasks"];
const OCCURRENCE_TABLES: Partial<Record<ReminderTable, string>> = { tasks: "task_occurrences", clt_tasks: "clt_task_occurrences" };
// 42703 = coluna inexistente no Postgres; PGRST204 = coluna fora do cache do PostgREST.
const isMissingColumn = (code?: string) => code === "42703" || code === "PGRST204";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}

async function loadCandidates(db: SupabaseClient, date: string) {
  const tasks: Array<ReminderTask & { table: ReminderTable }> = [];
  const occurrences: Array<ReminderOccurrence & { table: ReminderTable }> = [];
  for (const table of TABLES) {
    const single = await db.from(table).select("*").eq("due_date", date).not("scheduled_time", "is", null);
    if (single.error) throw single.error;
    for (const row of single.data ?? []) tasks.push({ ...(row as ReminderTask), table });

    const weekly = await db.from(table).select("*").eq("recurrence", "weekly").not("scheduled_time", "is", null).is("archived_at", null);
    // personal_work_tasks não tem recorrência — coluna ausente não é erro aqui.
    if (weekly.error && !isMissingColumn(weekly.error.code)) throw weekly.error;
    for (const row of weekly.data ?? []) tasks.push({ ...(row as ReminderTask), table });

    const occurrenceTable = OCCURRENCE_TABLES[table];
    if (occurrenceTable) {
      const occ = await db.from(occurrenceTable).select("*").eq("occurrence_date", date);
      if (occ.error) throw occ.error;
      for (const row of occ.data ?? []) occurrences.push({ ...(row as ReminderOccurrence), table });
    }
  }
  return { tasks, occurrences };
}

/** Tenta obter a trava de envio. Retorna o modo do log ou `null` para pular. */
async function acquire(db: SupabaseClient, reminder: DueReminder): Promise<"tracked" | "legacy" | null> {
  const tracked = await db.from("push_delivery_log").insert({ user_id: reminder.userId, event_key: reminder.eventKey, status: "sending", attempts: 1 });
  if (!tracked.error) return "tracked";
  if (isMissingColumn(tracked.error.code)) {
    const legacy = await db.from("push_delivery_log").insert({ user_id: reminder.userId, event_key: reminder.eventKey });
    if (!legacy.error) return "legacy";
    if (legacy.error.code === "23505") return null;
    throw legacy.error;
  }
  if (tracked.error.code !== "23505") throw tracked.error;

  const { data, error } = await db.from("push_delivery_log").select("status,attempts").eq("user_id", reminder.userId).eq("event_key", reminder.eventKey).maybeSingle();
  if (error) throw error;
  const row = data as LogRow | null;
  const attempts = Number(row?.attempts ?? 0);
  if (row?.status !== "failed" || attempts >= MAX_DELIVERY_ATTEMPTS) return null;
  // Atualização condicional: só um processo concorrente vence a nova tentativa.
  const retry = await db.from("push_delivery_log")
    .update({ status: "sending", attempts: attempts + 1, updated_at: new Date().toISOString() })
    .eq("user_id", reminder.userId).eq("event_key", reminder.eventKey).eq("status", "failed").eq("attempts", attempts)
    .select("id");
  if (retry.error) throw retry.error;
  return retry.data?.length ? "tracked" : null;
}

async function finish(db: SupabaseClient, mode: "tracked" | "legacy", reminder: DueReminder, result: { status: "sent" | "failed" | "no_subscription"; error?: string; sent: number }) {
  const match = db.from("push_delivery_log");
  if (mode === "legacy") {
    if (result.status === "failed") await match.delete().eq("user_id", reminder.userId).eq("event_key", reminder.eventKey);
    return;
  }
  const now = new Date().toISOString();
  await match.update({
    status: result.status,
    last_error: result.error?.slice(0, 500) ?? null,
    sent_count: result.sent,
    sent_at: result.status === "sent" ? now : null,
    updated_at: now,
  }).eq("user_id", reminder.userId).eq("event_key", reminder.eventKey);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return NextResponse.json({ error: "VAPID not configured" }, { status: 503 });

  try {
    const db = getSupabaseAdminClient() as unknown as SupabaseClient;
    webpush.setVapidDetails("mailto:admin@visionariodev.com.br", pub, priv);
    const now = new Date();
    const { date, time } = localDateTimeParts(now);
    const { tasks, occurrences } = await loadCandidates(db, date);

    const userIds = [...new Set(tasks.map((t) => t.user_id))];
    const preferences = new Map<string, ReminderPreferences>();
    if (userIds.length) {
      const { data, error } = await db.from("profiles").select("id,notification_preferences").in("id", userIds);
      if (error) throw error;
      for (const p of data ?? []) preferences.set(p.id as string, p.notification_preferences as ReminderPreferences);
    }

    const due = selectDueReminders({ now, tasks, occurrences, preferences });
    const summary = { ok: true, date, time, candidates: tasks.length, due: due.length, sent: 0, failed: 0, skipped: 0, noSubscription: 0 };

    for (const reminder of due) {
      const mode = await acquire(db, reminder);
      if (!mode) { summary.skipped++; continue; }

      // Somente as inscrições do DONO da tarefa — nunca de outro usuário.
      const { data: rows, error } = await db.from("push_subscriptions").select("user_id,endpoint,subscription").eq("user_id", reminder.userId);
      if (error) throw error;
      const subs = (rows ?? []) as Subscription[];
      if (!subs.length) {
        summary.noSubscription++;
        await finish(db, mode, reminder, { status: "no_subscription", sent: 0 });
        continue;
      }

      let sent = 0;
      const errors: string[] = [];
      for (const sub of subs) {
        try {
          await webpush.sendNotification(sub.subscription, JSON.stringify({
            title: "VS Planner • Lembrete de tarefa",
            body: `${reminder.time} · ${reminder.title}`,
            url: reminder.url,
            tag: reminder.eventKey,
          }), { TTL: 60 * 60, urgency: "high" });
          sent++;
        } catch (e) {
          const status = typeof e === "object" && e && "statusCode" in e ? Number((e as { statusCode: unknown }).statusCode) : 0;
          if (status === 404 || status === 410) {
            await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint).eq("user_id", reminder.userId);
          }
          errors.push(`${status || "erro"}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (sent) summary.sent += sent; else summary.failed++;
      if (errors.length) console.error("Task reminder delivery errors", { eventKey: reminder.eventKey, errors });
      await finish(db, mode, reminder, { status: sent ? "sent" : "failed", error: errors.join(" | ") || undefined, sent });
    }

    console.info("Task reminder run", summary);
    return NextResponse.json(summary);
  } catch (e) {
    console.error("Task reminder cron failed", e);
    return NextResponse.json({ error: "Task reminder processing failed" }, { status: 500 });
  }
}
