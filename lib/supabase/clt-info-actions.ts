"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { INFO_MIGRATION, isNewInfoColumn, normalizeInfoForm } from "@/lib/clt/registered-info";

/**
 * "Editar informações" do conjunto e do anúncio: atualiza SÓ as colunas de
 * cadastro enviadas (nome, IDs, link, textos, configurações). Métricas,
 * resultados e histórico ficam em outras tabelas e nunca são tocados.
 */

type State = { error?: string; success?: string };
const MISSING = new Set(["42703", "PGRST204"]);

function refresh() {
  ["/trabalho", "/trabalho/empresas", "/trabalho/campanhas", "/trabalho/relatorios"].forEach((p) => revalidatePath(p));
  revalidatePath("/trabalho/empresas/[id]", "page");
  revalidatePath("/visionario/mkt", "layout");
}

export async function updateCltRegisteredInfoAction(input: { level: "adSet" | "ad"; id: string; values: Record<string, string> }): Promise<State> {
  if (input.level !== "adSet" && input.level !== "ad") return { error: "Nível inválido." };
  if (typeof input.id !== "string" || !/^[0-9a-f-]{36}$/i.test(input.id) || !input.values || typeof input.values !== "object") return { error: "Dados inválidos." };
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sessão expirada. Entre novamente." };
  const db = supabase as unknown as SupabaseClient;
  const userId = auth.user.id;
  const table = input.level === "adSet" ? "clt_ad_sets" : "clt_ad_creatives";

  const n = normalizeInfoForm(input.level, input.values);
  if ("error" in n) return n;
  const update = n.update;
  if (!Object.keys(update).length) return { error: "Nada para salvar." };

  const { data: row, error: readError } = await db.from(table).select(input.level === "adSet" ? "id,campaign_id" : "id,ad_set_id").eq("id", input.id).eq("user_id", userId).maybeSingle();
  if (readError) return { error: readError.message };
  if (!row) return { error: input.level === "adSet" ? "Conjunto não encontrado." : "Anúncio não encontrado." };

  // Público vinculado precisa ser da MESMA empresa da campanha do conjunto.
  if (input.level === "adSet" && update.saved_audience_id) {
    const { data: campaign } = await db.from("clt_campaigns").select("company_id").eq("id", (row as { campaign_id: string }).campaign_id).eq("user_id", userId).maybeSingle();
    const { data: aud } = await db.from("clt_audiences").select("id,name").eq("id", String(update.saved_audience_id)).eq("user_id", userId).eq("company_id", (campaign as { company_id?: string } | null)?.company_id ?? "").maybeSingle();
    if (!aud) return { error: "Público não encontrado nesta empresa." };
  }

  const run = (values: Record<string, unknown>) => db.from(table).update(values).eq("id", input.id).eq("user_id", userId).select("id");
  let { data, error } = await run(update);
  if (error && MISSING.has(String(error.code))) {
    // Migration 20261109100000 pendente: grava as colunas antigas se as novas estiverem vazias.
    const newCols = Object.keys(update).filter((k) => isNewInfoColumn(input.level, k));
    if (newCols.some((k) => update[k] !== null)) return { error: `Nada foi salvo. ${INFO_MIGRATION}` };
    ({ data, error } = await run(Object.fromEntries(Object.entries(update).filter(([k]) => !newCols.includes(k)))));
  }
  if (error) return { error: error.code === "23505" ? "Este ID da Meta já está cadastrado em outro registro." : error.message };
  if (!data?.length) return { error: "Não foi possível confirmar a gravação. Recarregue a página." };
  refresh();
  return { success: "Informações salvas. Métricas e histórico não foram alterados." };
}
