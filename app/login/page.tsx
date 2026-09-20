import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LoginForm } from "@/components/auth/login-form";

/**
 * Server Component: checagem server-side extra (req. 16) além da otimista
 * do `proxy.ts` — se já existe sessão Supabase válida, nem renderiza o
 * formulário, redireciona direto para /hoje.
 */
export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/hoje");
  }

  return <LoginForm />;
}
