import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import webpush from "web-push";
export async function POST() {
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
    let sent = 0;
    for (const row of subscriptions) {
      try {
        for (let i = 1; i <= 5; i++) {
          await webpush.sendNotification(row.subscription as webpush.PushSubscription, JSON.stringify({
            title: "VS Planner • Teste " + i + "/5", body: "Notificação de teste número " + i + ".", url: "/hoje",
            tag: "vs-test-" + i + "-" + Date.now()
          }));
          sent++;
        }
      } catch (e) {
        if (typeof e === "object" && e && "statusCode" in e && [404,410].includes(Number(e.statusCode)))
          await admin.schema("public").from("push_subscriptions" as never).delete().eq("endpoint", row.endpoint);
      }
    }
    return NextResponse.json({ ok: sent > 0, sent });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Erro no envio" }, { status: 500 }); }
}
