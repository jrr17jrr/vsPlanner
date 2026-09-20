import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminUserRow } from "@/types/database.types";

/**
 * Leituras administrativas (Painel Dev) que precisam de dados fora de
 * `public` (e-mail e último acesso vivem em `auth.users`). Em vez de usar
 * a Service Role para uma simples listagem, chamamos a função
 * `admin_list_users()` (migration 002) — `security definer`, mas que só
 * retorna linhas se quem chamou for super_admin (checado dentro da função
 * SQL, não só pelo `grant execute`).
 */
export async function adminListUsers(): Promise<AdminUserRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_list_users");

  if (error) throw error;
  return data ?? [];
}

export async function adminGetUser(id: string): Promise<AdminUserRow | null> {
  const users = await adminListUsers();
  return users.find((u) => u.id === id) ?? null;
}
