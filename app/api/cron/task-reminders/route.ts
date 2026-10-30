import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import webpush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Task = { id: string; user_id: string; title: string; due_date: string | null; scheduled_time: string | null; status: string; archived_at?: string | null };
type Subscription = { user_id: string; endpoint: string; subscription: webpush.PushSubscription };

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return NextResponse.json({ error: "VAPID not configured" }, { status: 503 });

  try {
    const admin = getSupabaseAdminClient();
    webpush.setVapidDetails("mailto:admin@visionariodev.com.br", pub, priv);
    const now = new Date();
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(now);
    const part = (key: string) => local.find((p) => p.type === key)?.value ?? "";
    const date = `${part("year")}-${part("month")}-${part("day")}`;
    const time = `${part("hour")}:${part("minute")}`;
    const earliest = new Date(now.getTime() - 5 * 60_000);
    const earliestParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(earliest);
    const old = (key: string) => earliestParts.find((p) => p.type === key)?.value ?? "";
    const oldDate = `${old("year")}-${old("month")}-${old("day")}`;
    const oldTime = `${old("hour")}:${old("minute")}`;
    const tables = ["tasks", "personal_work_tasks", "clt_tasks"] as const;
    const candidates: Array<Task & { table: string }> = [];
    for (const table of tables) {
      const { data, error } = await admin.from(table).select("id,user_id,title,due_date,scheduled_time,status").eq("due_date", date).not("scheduled_time", "is", null).lte("scheduled_time", `${time}:59`);
      if (error) throw error;
      for (const task of (data ?? []) as Task[]) {
        if (task.status === "concluido" || task.status === "completed" || task.status === "cancelado") continue;
        if (!task.scheduled_time || task.scheduled_time.slice(0, 5) < (date === oldDate ? oldTime : "00:00")) continue;
        candidates.push({ ...task, table });
      }
    }
    let sent = 0;
    for (const task of candidates) {
      const event_key = `task-reminder:${task.table}:${task.id}:${date}:${task.scheduled_time?.slice(0,5)}`;
      const { error: logError } = await admin.from("push_delivery_log").insert({ user_id: task.user_id, event_key });
      if (logError) {
        if (logError.code === "23505") continue;
        throw logError;
      }
      const { data: rows, error } = await admin.from("push_subscriptions").select("user_id,endpoint,subscription").eq("user_id", task.user_id);
      if (error) throw error;
      const subs = (rows ?? []) as Subscription[];
      let delivered = false;
      for (const sub of subs) {
        try {
          await webpush.sendNotification(sub.subscription, JSON.stringify({
            title: "VS Planner • Lembrete de tarefa", body: task.title,
            url: task.table === "clt_tasks" ? "/trabalho" : "/hoje", tag: event_key
          }));
          sent++;
          delivered = true;
        } catch (e) {
          if (typeof e === "object" && e && "statusCode" in e && [404, 410].includes(Number(e.statusCode))) {
            await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
        }
      }
      if (!delivered) await admin.from("push_delivery_log").delete().eq("user_id", task.user_id).eq("event_key", event_key);
    }
    return NextResponse.json({ ok: true, checked: candidates.length, sent });
  } catch (e) {
    console.error("Task reminder cron failed", e);
    return NextResponse.json({ error: "Task reminder processing failed" }, { status: 500 });
  }
}
