"use server";
import { requireActiveProfile } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { validateNotificationPrefs, type NotificationPrefs } from "@/lib/notification-prefs";

export type NotificationCategory = "tasks" | "routine" | "meetings" | "finance" | "clt";
/** Preferências completas (categorias antigas + tipos/antecedência/horário). Regras em lib/notification-prefs.ts. */
export type NotificationPreferences = NotificationPrefs;

export async function saveNotificationPreferencesAction(input: NotificationPreferences): Promise<{ error?: string; success?: string }> {
  const { profile } = await requireActiveProfile();
  const validated = validateNotificationPrefs(input);
  if ("error" in validated) return { error: validated.error };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("profiles").update({ notification_preferences: validated.value as never }).eq("id", profile.id);
  if (error) return { error: error.message };
  revalidatePath("/configuracoes");
  return { success: "Preferências de notificações salvas." };
}
