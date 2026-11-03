import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { localDateTimeParts, selectDueReminders } from "@/lib/push/reminders";
import { planReminders } from "@/lib/push/schedule-reminders";
import { resolveNotificationPrefs } from "@/lib/notification-prefs";
import { loadLegacyCandidates, loadPreferences, loadScheduleSources } from "@/lib/push/reminder-sources";
import { ensureCronConfigured } from "@/lib/push/cron-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnóstico das notificações do USUÁRIO LOGADO (Configurações): saúde do
 * agendador, aparelhos inscritos, próximos lembretes (24 h, mesmas regras do
 * cron) e últimos envios. Somente leitura — não envia nada. Nunca devolve
 * endpoints, chaves, segredos nem dados de outros usuários.
 */
const SERVICE: Array<[RegExp, string]> = [[/push\.apple\.com/, "Apple (iPhone/iPad/Mac)"], [/fcm\.googleapis\.com|googleapis/, "Google (Chrome/Android)"], [/mozilla/, "Mozilla (Firefox)"], [/windows|notify\.windows/, "Microsoft (Edge)"]];
const serviceOf = (endpoint: string) => SERVICE.find(([re]) => re.test(endpoint))?.[1] ?? "Outro navegador";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const db = getSupabaseAdminClient() as unknown as SupabaseClient;
  const now = new Date();
  const { date, time } = localDateTimeParts(now);

  const config = await ensureCronConfigured(db, request.url).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : "erro" }));
  const [scheduler, runs, subs, deliveries, profile] = await Promise.all([
    db.rpc("vsplanner_cron_status"),
    db.from("push_cron_runs").select("ran_at,source,due,sent,failed,no_subscription,errors").order("ran_at", { ascending: false }).limit(5),
    db.from("push_subscriptions").select("endpoint,created_at").eq("user_id", user.id),
    db.from("push_delivery_log").select("event_key,status,attempts,sent_count,last_error,created_at,sent_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(15),
    db.from("profiles").select("system_role").eq("id", user.id).maybeSingle(),
  ]);
  const admin = profile.data?.system_role === "super_admin";

  // Próximos lembretes (24 h) — mesmas regras e fontes do cron, só deste usuário.
  let upcoming: Array<{ at: string; title: string; body: string }> = [];
  let upcomingError: string | null = null;
  try {
    const [sources, legacy, prefs] = await Promise.all([loadScheduleSources(db, date, user.id), loadLegacyCandidates(db, date, user.id), loadPreferences(db, [user.id])]);
    const userPrefs = prefs.resolved.get(user.id) ?? resolveNotificationPrefs(null);
    const nowKey = `${date}T${time}`;
    const end = localDateTimeParts(new Date(now.getTime() + 24 * 3600_000));
    const endKey = `${end.date}T${end.time}`;
    const seen = new Set<string>();
    const planned = planReminders({ ...sources, prefs: () => userPrefs }, date)
      .filter((p) => p.fireAt > nowKey && p.fireAt <= endKey)
      .sort((a, b) => a.fireAt.localeCompare(b.fireAt) || Number(a.type === "routine") - Number(b.type === "routine"))
      .filter((p) => !seen.has(p.dedupeKey) && !!seen.add(p.dedupeKey))
      .map((p) => ({ at: p.fireAt, title: p.title, body: p.body }));
    // Trabalho/CLT (lembrete no horário): mesma função do cron, com a janela "de agora até 23:59".
    const endOfDay = new Date(Date.parse(`${date}T23:59:00-03:00`));
    const minutesLeft = Math.max(0, Math.floor((endOfDay.getTime() - now.getTime()) / 60_000) - 1);
    const legacyDue = minutesLeft > 0 ? selectDueReminders({ now: endOfDay, catchUpMinutes: minutesLeft, tasks: legacy.tasks, occurrences: legacy.occurrences, preferences: prefs.legacy })
      .filter((r) => r.time > time).map((r) => ({ at: `${r.date}T${r.time}`, title: "VS Planner • Lembrete de tarefa", body: `${r.time} · ${r.title}` })) : [];
    upcoming = [...planned, ...legacyDue].sort((a, b) => a.at.localeCompare(b.at)).slice(0, 15);
  } catch (e) {
    upcomingError = e instanceof Error ? e.message.slice(0, 200) : "erro";
  }

  return NextResponse.json({
    now: `${date}T${time}`,
    timeZone: "America/Sao_Paulo",
    config,
    scheduler: scheduler.error ? { error: scheduler.error.message } : scheduler.data,
    // Contagens globais; motivos detalhados só para administradores (podem citar registros de outros usuários).
    recentRuns: runs.error ? { error: runs.error.message } : (runs.data ?? []).map((r) => ({ ...r, errors: admin ? r.errors : Array.isArray(r.errors) ? r.errors.length : 0 })),
    devices: (subs.data ?? []).map((s) => ({ service: serviceOf(String(s.endpoint)), createdAt: s.created_at })),
    upcoming,
    upcomingError,
    deliveries: deliveries.error ? { error: deliveries.error.message } : deliveries.data,
  });
}
