import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth ||
      typeof body.endpoint !== "string" || !body.endpoint.startsWith("https://") ||
      body.endpoint.length > 2048) return NextResponse.json({ error: "Assinatura inválida" }, { status: 400 });
  try {
    const admin = getSupabaseAdminClient();
    const { error } = await admin.from("push_subscriptions").upsert({
      user_id: user.id, endpoint: body.endpoint, subscription: body
    }, { onConflict: "endpoint" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao salvar" }, { status: 500 }); }
}
