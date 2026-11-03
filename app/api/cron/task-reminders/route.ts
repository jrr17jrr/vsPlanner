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
import { selectScheduledReminders, type ReminderActivityRow, type ReminderSubtaskRow, type ReminderTaskRow } from "@/lib/push/schedule-reminders";
import { resolveNotificationPrefs, type NotificationPrefs } from "@/lib/notification-prefs";
import webpush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lembretes de tarefas. Disparado a cada minuto pelo Supabase Cron
 * (`pg_cron` + `pg_net`, migration 20261103100000_task_reminders_cron +
 * segredos no Vault, ver supabase/cron/task_reminders.sql) e uma vez por
 * dia pelo cron da Vercel (fallback). O cron só AGENDA a verificação — quem
 * entrega é o Web Push (VAPID) para as inscrições do próprio dono da tarefa.
 *
 * Deduplicação: `push_delivery_log (user_id, event_key)` é único; a linha é
 * criada ANTES do envio (trava). Com a migration 20261030_push_delivery_status
 * aplicada, falhas ficam registradas (`status = failed`, `last_error`) e são
 * re-tentadas até MAX_DELIVERY_ATTEMPTS dentro da janela de recuperação.
 * Sem ela, mantém o comportamento antigo (apaga a trava para tentar de novo).
 *
 * Tarefas pessoais, subtarefas e Rotina usam lib/push/schedule-reminders.ts
 * (execução + antecedência, prazo amanhã/hoje, atraso). Trabalho/CLT
 * (personal_work_tasks, clt_tasks) seguem com selectDueReminders.
 */

type Subscription = { user_id: string; endpoint: string; subscription: webpush.PushSubscription };
type LogRow = { status?: string | null; attempts?: number | null };

/** Tabelas no fluxo antigo (só "no horário"). `tasks` passou para o motor novo. */
const TABLES: ReminderTable[] = ["personal_work_tasks", "clt_tasks"];

type Outgoing = { userId: string; eventKey: string; url: string; title: string; body: string };

function shiftDate(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Tarefas pessoais, subtarefas e atividades com lembrete — estado ATUAL (concluídas ficam de fora). */
async function loadScheduleSources(db: SupabaseClient, today: string) {
  const from = shiftDate(today, -8);
  const to = shiftDate(today, 1);

  let tasksRes = await db.from("tasks").select("*").is("archived_at", null).neq("status", "concluida")
    .or(`recurrence.eq.weekly,and(due_date.gte.${from},due_date.lte.${to}),and(deadline_date.gte.${from},deadline_date.lte.${to})`);
  if (tasksRes.error && isMissingColumn(tasksRes.error.code)) {
    tasksRes = await db.from("tasks").select("*").is("archived_at", null).neq("status", "concluida")
      .or(`recurrence.eq.weekly,and(due_date.gte.${from},due_date.lte.${to})`);
  }
  if (tasksRes.error) throw tasksRes.error;
  const tasks = (tasksRes.data ?? []) as ReminderTaskRow[];

  const occRes = await db.from("task_occurrences").select("task_id,occurrence_date,status,scheduled_time,title").gte("occurrence_date", today).lte("occurrence_date", to);
  if (occRes.error) throw occRes.error;

  let subRes = await db.from("task_subtasks").select("*").eq("is_done", false)
    .or(`and(scheduled_date.gte.${today},scheduled_date.lte.${to}),and(due_date.gte.${from},due_date.lte.${to})`);
  if (subRes.error && isMissingColumn(subRes.error.code)) {
    subRes = await db.from("task_subtasks").select("*").eq("is_done", false).gte("due_date", from).lte("due_date", to);
  }
  if (subRes.error) throw subRes.error;
  const rawSubs = (subRes.data ?? []) as Array<ReminderSubtaskRow>;

  // Título e estado da tarefa-pai (subtarefa de tarefa concluída não notifica).
  const parents = new Map<string, { title: string; closed: boolean }>();
  const PARENT: Record<string, { table: string; closed: (r: Record<string, unknown>) => boolean }> = {
    pessoal: { table: "tasks", closed: (r) => r.status === "concluida" || !!r.archived_at },
    clt: { table: "clt_tasks", closed: (r) => r.status === "concluida" || !!r.archived_at },
    visionario: { table: "work_items", closed: (r) => r.status === "concluido" || r.status === "cancelado" },
  };
  for (const [type, cfg] of Object.entries(PARENT)) {
    const ids = [...new Set(rawSubs.filter((s) => s.parent_type === type).map((s) => s.parent_id))];
    if (!ids.length) continue;
    const res = await db.from(cfg.table).select("*").in("id", ids);
    if (res.error) throw res.error;
    for (const r of (res.data ?? []) as Array<Record<string, unknown>>) parents.set(`${type}:${r.id}`, { title: String(r.title ?? ""), closed: cfg.closed(r) });
  }
  const subtasks: ReminderSubtaskRow[] = rawSubs.map((s) => {
    const parent = parents.get(`${s.parent_type}:${s.parent_id}`);
    return { ...s, parentTitle: parent?.title ?? null, parentClosed: !parent || parent.closed };
  });

  // Rotina: só atividades com lembrete configurado (coluna nova; sem migration = sem lembrete de rotina).
  let activities: ReminderActivityRow[] = [];
  let completions: Array<{ activity_id: string; occurrence_date: string }> = [];
  const actRes = await db.from("activities").select("*").eq("is_active", true).not("reminder_offsets", "eq", "{}");
  if (actRes.error && !isMissingColumn(actRes.error.code)) throw actRes.error;
  if (!actRes.error) {
    activities = (actRes.data ?? []) as ReminderActivityRow[];
    const linkedIds = [...new Set(activities.map((a) => a.task_id).filter(Boolean))] as string[];
    if (linkedIds.length) {
      const linked = await db.from("tasks").select("id,title,status,recurrence,archived_at").in("id", linkedIds);
      if (linked.error) throw linked.error;
      const byId = new Map((linked.data ?? []).map((t) => [t.id as string, t]));
      activities = activities.map((a) => {
        const t = a.task_id ? byId.get(a.task_id) : undefined;
        return { ...a, linkedTask: a.task_id ? { title: String(t?.title ?? a.title), closed: !t || !!t.archived_at || (t.recurrence !== "weekly" && t.status === "concluida") } : null };
      });
    }
    if (activities.length) {
      const comp = await db.from("activity_completions").select("activity_id,occurrence_date").in("activity_id", activities.map((a) => a.id)).gte("occurrence_date", today).lte("occurrence_date", to);
      if (comp.error) throw comp.error;
      completions = comp.data ?? [];
    }
  }

  return { tasks, occurrences: occRes.data ?? [], subtasks, activities, completions };
}
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
async function acquire(db: SupabaseClient, reminder: Outgoing): Promise<"tracked" | "legacy" | null> {
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

async function finish(db: SupabaseClient, mode: "tracked" | "legacy", reminder: Outgoing, result: { status: "sent" | "failed" | "no_subscription"; error?: string; sent: number }) {
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
    const [{ tasks, occurrences }, sources] = await Promise.all([loadCandidates(db, date), loadScheduleSources(db, date)]);

    const userIds = [...new Set([
      ...tasks.map((t) => t.user_id), ...sources.tasks.map((t) => t.user_id),
      ...sources.subtasks.map((s) => s.user_id), ...sources.activities.map((a) => a.user_id),
    ])];
    const preferences = new Map<string, ReminderPreferences>();
    const resolved = new Map<string, NotificationPrefs>();
    if (userIds.length) {
      const { data, error } = await db.from("profiles").select("id,notification_preferences").in("id", userIds);
      if (error) throw error;
      for (const p of data ?? []) {
        const prefs = resolveNotificationPrefs(p.notification_preferences);
        resolved.set(p.id as string, prefs);
        // Interruptor geral também desliga o fluxo antigo.
        preferences.set(p.id as string, prefs.enabled ? (p.notification_preferences as ReminderPreferences) : { tasks: false, clt: false });
      }
    }

    const legacy: Outgoing[] = selectDueReminders({ now, tasks, occurrences, preferences }).map((r: DueReminder) => ({
      userId: r.userId, eventKey: r.eventKey, url: r.url, title: "VS Planner • Lembrete de tarefa", body: `${r.time} · ${r.title}`,
    }));
    const scheduled: Outgoing[] = selectScheduledReminders({
      now, ...sources, prefs: (userId) => resolved.get(userId) ?? resolveNotificationPrefs(null),
    }).map((r) => ({ userId: r.userId, eventKey: r.eventKey, url: r.url, title: r.title, body: r.body }));
    const due = [...legacy, ...scheduled];
    const summary = {
      ok: true, date, time,
      candidates: tasks.length + sources.tasks.length + sources.subtasks.length + sources.activities.length,
      due: due.length, sent: 0, failed: 0, skipped: 0, noSubscription: 0,
    };

    // Diagnóstico (`?dry=1`): mostra o que sairia agora, sem enviar nem gravar trava.
    if (new URL(request.url).searchParams.get("dry") === "1") {
      return NextResponse.json({ ...summary, dryRun: true, reminders: due.map(({ eventKey, title, body, url }) => ({ eventKey, title, body, url })) });
    }

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
            title: reminder.title,
            body: reminder.body,
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
