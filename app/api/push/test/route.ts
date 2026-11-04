import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import webpush from "web-push";
import { ensureCronConfigured } from "@/lib/push/cron-config";
import type { SupabaseClient } from "@supabase/supabase-js";
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return NextResponse.json({ error: "Configure as chaves VAPID na Vercel." }, { status: 503 });
  try {
    webpush.setVapidDetails("mailto:admin@visionariodev.com.br", pub, priv);
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.schema("public").from("push_subscriptions" as never).select("subscription,endpoint").eq("user_id", user.id);
    if (error) throw error;
    const subscriptions = (data ?? []) as unknown as Array<{ subscription: webpush.PushSubscription; endpoint: string }>;
    if (!subscriptions.length) return NextResponse.json({ error: "Ative as notificações neste aparelho primeiro." }, { status: 400 });
    // Configurações manda 5 (teste de rajada); o formulário da Rotina manda 1.
    const body = await request.json().catch(() => ({})) as { count?: unknown };
    const count = Math.min(5, Math.max(1, Math.trunc(Number(body?.count) || 5)));
    let sent = 0;
    for (const row of subscriptions) {
      try {
        for (let i = 1; i <= count; i++) {
          await webpush.sendNotification(row.subscription as webpush.PushSubscription, JSON.stringify(count === 1
            ? { title: "VS Planner • Teste", body: "As notificações estão funcionando neste aparelho.", url: "/rotina", tag: "vs-test-" + Date.now() }
            : {
            title: "VS Planner • Teste " + i + "/" + count, body: "Notificação de teste número " + i + ".", url: "/hoje",
            tag: "vs-test-" + i + "-" + Date.now()
          }));
          sent++;
        }
      } catch (e) {
        if (typeof e === "object" && e && "statusCode" in e && [404,410].includes(Number(e.statusCode)))
          await admin.schema("public").from("push_subscriptions" as never).delete().eq("endpoint", row.endpoint);
      }
    }
    // Aproveita o toque do usuário para garantir o agendamento automático (só em produção; nunca bloqueia o teste).
    const schedule = await ensureCronConfigured(admin as unknown as SupabaseClient, request.url, { force: true }).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : "erro" }));
    return NextResponse.json({ ok: sent > 0, sent, schedule });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Erro no envio" }, { status: 500 }); }
}
