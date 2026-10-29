"use server";
import { requireActiveProfile } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export const NOTIFICATION_CATEGORIES = ["tasks","routine","meetings","finance","clt"] as const;
export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];
export type NotificationPreferences = Record<NotificationCategory,boolean>;

export async function saveNotificationPreferencesAction(input:NotificationPreferences):Promise<{error?:string;success?:string}>{
 const {profile}=await requireActiveProfile();
 if (!input || NOTIFICATION_CATEGORIES.some(k=>typeof input[k]!=="boolean")) return {error:"Preferências inválidas."};
 const supabase=await createSupabaseServerClient();
 const {error}=await supabase.from("profiles").update({notification_preferences:input}).eq("id",profile.id);
 if(error)return {error:error.message};
 revalidatePath("/configuracoes");
 return {success:"Preferências de notificações salvas."};
}
