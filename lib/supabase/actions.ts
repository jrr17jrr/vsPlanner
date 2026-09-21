"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listMySpaces } from "@/lib/supabase/repositories/spaces.repository";

export interface LoginActionState {
  error?: string;
}

/**
 * Tenta autenticar; retorna `{ error }` em qualquer falha (credenciais,
 * perfil ausente, conta bloqueada, conexão) ou `null` em caso de sucesso.
 * Mantido separado de `loginAction` para que o `redirect("/hoje")` do
 * caminho de sucesso fique fora do `try/catch` — `redirect()` funciona
 * lançando uma exceção interna do Next.js, que não deve ser capturada.
 */
async function performLogin(formData: FormData): Promise<LoginActionState | null> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Informe e-mail e senha." };
  }

  try {
    const supabase = await createSupabaseServerClient();

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      return { error: "E-mail ou senha inválidos." };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Não foi possível confirmar a sessão. Tente novamente." };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return { error: "Falha ao carregar seu perfil. Tente novamente." };
    }

    if (!profile) {
      await supabase.auth.signOut();
      return { error: "Perfil não encontrado para esta conta." };
    }

    if (profile.status !== "active") {
      await supabase.auth.signOut();
      return { error: "Esta conta está bloqueada. Fale com um administrador." };
    }

    // Carrega os spaces do usuário (RLS) como parte do bootstrap pós-login
    // — puro aquecimento, o layout já resolve os spaces de novo ao
    // renderizar. Best-effort: uma falha aqui não deve impedir o acesso.
    try {
      await listMySpaces();
    } catch {
      // intencionalmente ignorado — ver comentário acima.
    }

    return null;
  } catch {
    return { error: "Falha de conexão com o Supabase. Verifique sua internet e tente novamente." };
  }
}

export async function loginAction(
  _prevState: LoginActionState | undefined,
  formData: FormData
): Promise<LoginActionState> {
  const result = await performLogin(formData);
  if (result) return result;

  redirect("/hoje");
}

export async function logoutAction(): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // mesmo se o signOut falhar, seguimos para /login.
  }

  redirect("/login");
}
