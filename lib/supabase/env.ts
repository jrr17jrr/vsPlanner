/**
 * Lê e valida as variáveis de ambiente do Supabase.
 *
 * Lança um erro claro (em vez de deixar o `@supabase/ssr` falhar com uma
 * mensagem genérica de URL inválida) quando as variáveis ainda não foram
 * configuradas — o que é esperado até a Fase 1 ser aplicada no Supabase e
 * as chaves serem coladas em `.env.local` / na Vercel. Ver `SUPABASE_SETUP.md`.
 */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase ainda não está configurado: defina NEXT_PUBLIC_SUPABASE_URL e " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY em .env.local (veja SUPABASE_SETUP.md). " +
        "O restante do app continua funcionando normalmente com os dados mock " +
        "— este erro só aparece se algo tentar usar o cliente Supabase antes " +
        "da Fase 1 estar configurada."
    );
  }

  return { url, anonKey };
}
