"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Histórico de anotações de campanha/conjunto/anúncio (migration
 * 20261110110000). Só LÊ e ACRESCENTA — anotações anteriores nunca são
 * alteradas nem apagadas.
 */

export type NoteLevel = "campaign" | "ad_set" | "ad";
export type CltEntityNote = { id: string; level: NoteLevel; body: string; author_name: string | null; created_at: string };
export type NoteTarget = { level: NoteLevel; campaignId: string; adSetId?: string | null; creativeId?: string | null };

const UUID = /^[0-9a-f-]{36}$/i;
const NOTES_MIGRATION_MESSAGE = "Anotações ainda não ativadas no banco: execute a migração 20261110110000_clt_entity_notes.sql no Supabase.";
const isMissing = (e: { code?: string; message?: string } | null) => !!e && (["42P01", "PGRST205"].includes(String(e.code)) || (/clt_entity_notes/.test(e.message ?? "") && /does not exist|schema cache|Could not find/i.test(e.message ?? "")));

function validTarget(t: NoteTarget): string | null {
  if (!t || !["campaign", "ad_set", "ad"].includes(t.level) || !UUID.test(t.campaignId ?? "")) return "Registro inválido.";
  if (t.level !== "campaign" && !UUID.test(t.adSetId ?? "")) return "Conjunto inválido.";
  if (t.level === "ad" && !UUID.test(t.creativeId ?? "")) return "Anúncio inválido.";
  return null;
}

async function ctx() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return { db: supabase as unknown as SupabaseClient, userId: data.user?.id ?? null };
}

export async function listCltEntityNotesAction(target: NoteTarget): Promise<{ notes: CltEntityNote[]; error?: string; missing?: boolean }> {
  const invalid = validTarget(target);
  if (invalid) return { notes: [], error: invalid };
  const { db, userId } = await ctx();
  if (!userId) return { notes: [], error: "Sessão expirada. Entre novamente." };
  let q = db.from("clt_entity_notes").select("id, level, body, author_name, created_at").eq("user_id", userId).eq("level", target.level).eq("campaign_id", target.campaignId);
  if (target.level !== "campaign") q = q.eq("ad_set_id", target.adSetId!);
  if (target.level === "ad") q = q.eq("creative_id", target.creativeId!);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
  if (error) return isMissing(error) ? { notes: [], missing: true, error: NOTES_MIGRATION_MESSAGE } : { notes: [], error: error.message };
  return { notes: (data ?? []) as CltEntityNote[] };
}

export async function addCltEntityNoteAction(target: NoteTarget, body: string): Promise<{ note?: CltEntityNote; error?: string }> {
  const invalid = validTarget(target);
  if (invalid) return { error: invalid };
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return { error: "Escreva a anotação." };
  if (text.length > 4000) return { error: "A anotação pode ter até 4.000 caracteres." };
  const { db, userId } = await ctx();
  if (!userId) return { error: "Sessão expirada. Entre novamente." };
  const { data: profile } = await db.from("profiles").select("name").eq("id", userId).maybeSingle();
  const { data, error } = await db
    .from("clt_entity_notes")
    .insert({
      user_id: userId,
      level: target.level,
      campaign_id: target.campaignId,
      ad_set_id: target.level === "campaign" ? null : target.adSetId,
      creative_id: target.level === "ad" ? target.creativeId : null,
      body: text,
      author_name: (profile as { name?: string } | null)?.name ?? null,
    })
    .select("id, level, body, author_name, created_at")
    .single();
  if (error) return { error: isMissing(error) ? NOTES_MIGRATION_MESSAGE : error.message };
  return { note: data as CltEntityNote };
}
