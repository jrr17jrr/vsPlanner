"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ProfileStatus, SystemRole } from "@/types/database.types";

export type AdminActionState = {
  error?: string;
  success?: string;
};

/**
 * Todas as actions abaixo chamam `requireSuperAdmin()` de novo, mesmo que
 * só sejam usadas a partir de telas já protegidas por
 * `app/(app)/dev/layout.tsx` — nunca confiar só na rota estar escondida.
 * Além disso, o RLS (migration 001) e as triggers de segurança (migration
 * 002 — não deixar o espaço/sistema sem owner/super_admin) continuam
 * valendo por trás disso: mesmo se este arquivo tivesse um bug, o banco
 * ainda bloqueia as operações perigosas.
 */

export async function updateUserNameAction(
  userId: string,
  name: string
): Promise<AdminActionState> {
  await requireSuperAdmin();

  const trimmed = name.trim();
  if (!trimmed) {
    return { error: "Nome não pode ficar vazio." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ name: trimmed })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Usuário não encontrado." };

  revalidatePath(`/dev/usuarios/${userId}`);
  revalidatePath("/dev");
  return { success: "Nome atualizado." };
}

export async function setUserStatusAction(
  userId: string,
  status: ProfileStatus,
  opts?: { confirmSelf?: boolean }
): Promise<AdminActionState> {
  const { profile: actor } = await requireSuperAdmin();

  if (actor.id === userId && status === "blocked" && !opts?.confirmSelf) {
    return { error: "Confirme explicitamente antes de bloquear a própria conta." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Usuário não encontrado." };

  revalidatePath(`/dev/usuarios/${userId}`);
  revalidatePath("/dev");
  return { success: status === "active" ? "Usuário ativado." : "Usuário bloqueado." };
}

export async function setUserSystemRoleAction(
  userId: string,
  systemRole: SystemRole,
  opts?: { confirmSelf?: boolean }
): Promise<AdminActionState> {
  const { profile: actor } = await requireSuperAdmin();

  if (actor.id === userId && systemRole !== "super_admin" && !opts?.confirmSelf) {
    return {
      error: "Confirme explicitamente antes de remover o seu próprio acesso de super_admin.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ system_role: systemRole })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Usuário não encontrado." };

  revalidatePath(`/dev/usuarios/${userId}`);
  revalidatePath("/dev");
  return { success: "system_role atualizado." };
}

/**
 * As três actions abaixo usam a Supabase Admin API (Service Role) — só
 * disponível onde `SUPABASE_SERVICE_ROLE_KEY` está configurada (hoje: só
 * na Vercel). `getSupabaseAdminClient()` lança um erro claro se a env var
 * não existir; capturado abaixo e devolvido como `{ error }` em vez de
 * derrubar a request.
 */

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  status: ProfileStatus;
  systemRole: SystemRole;
};

export type CreateUserActionState = AdminActionState & { userId?: string };

export async function createUserAction(
  input: CreateUserInput
): Promise<CreateUserActionState> {
  await requireSuperAdmin();

  const name = input.name.trim();
  const email = input.email.trim();

  if (!name) return { error: "Nome é obrigatório." };
  if (!email) return { error: "E-mail é obrigatório." };
  if (input.password.length < 8) {
    return { error: "Senha deve ter pelo menos 8 caracteres." };
  }

  let newUserId: string;

  try {
    const admin = getSupabaseAdminClient();

    // email_confirm: true — criado pelo super_admin, não precisa do fluxo
    // de confirmação por e-mail. user_metadata.name é lido por
    // handle_new_user() (migration 001) para preencher profiles.name.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (error) return { error: error.message };
    if (!data.user) return { error: "Falha ao criar usuário (resposta vazia da Admin API)." };

    newUserId = data.user.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao criar usuário." };
  }

  // Neste ponto handle_new_user já criou profile (system_role='user',
  // status='active'), space Pessoal e a membership owner. Se o formulário
  // pediu um status/system_role diferente do default, ajusta agora — via
  // RLS normal do super_admin (is_super_admin() já embutido nas policies
  // da migration 001), sem precisar da Service Role para isso.
  if (input.status !== "active" || input.systemRole !== "user") {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("profiles")
      .update({ status: input.status, system_role: input.systemRole })
      .eq("id", newUserId);

    if (error) {
      return {
        success:
          "Usuário criado, mas houve falha ao aplicar status/system_role iniciais: " +
          error.message,
        userId: newUserId,
      };
    }
  }

  revalidatePath("/dev");
  return { success: "Usuário criado.", userId: newUserId };
}

export async function updateUserEmailAction(
  userId: string,
  newEmail: string
): Promise<AdminActionState> {
  await requireSuperAdmin();

  const trimmed = newEmail.trim();
  if (!trimmed) return { error: "E-mail não pode ficar vazio." };

  try {
    const admin = getSupabaseAdminClient();
    // email_confirm: true — alteração administrativa, já entra confirmada
    // (sem o fluxo de e-mail de confirmação do usuário final).
    const { error } = await admin.auth.admin.updateUserById(userId, {
      email: trimmed,
      email_confirm: true,
    });
    if (error) return { error: error.message };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao alterar e-mail." };
  }

  revalidatePath(`/dev/usuarios/${userId}`);
  revalidatePath("/dev");
  return { success: "E-mail atualizado." };
}

export async function setUserPasswordAction(
  userId: string,
  newPassword: string
): Promise<AdminActionState> {
  await requireSuperAdmin();

  if (newPassword.length < 8) {
    return { error: "Senha deve ter pelo menos 8 caracteres." };
  }

  try {
    const admin = getSupabaseAdminClient();
    // Não depende (nem pede) a senha atual — é exatamente para isso que a
    // Admin API existe. O Supabase nunca guarda/retorna a senha em texto
    // puro, então não há "senha atual" para mostrar em lugar nenhum.
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (error) return { error: error.message };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao definir senha." };
  }

  return { success: "Senha definida." };
}
