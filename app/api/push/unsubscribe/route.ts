import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Remove a inscrição push DESTE aparelho do usuário autenticado — chamado
 * antes do logout, para que lembretes de uma conta não continuem chegando
 * num aparelho onde outra pessoa vai entrar.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint.startsWith("https://") || endpoint.length > 2048) return NextResponse.json({ error: "Assinatura inválida" }, { status: 400 });
  try {
    const admin = getSupabaseAdminClient();
    const { error } = await admin.schema("public").from("push_subscriptions" as never).delete().eq("endpoint", endpoint).eq("user_id", user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao remover" }, { status: 500 }); }
}
