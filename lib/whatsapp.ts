/**
 * Normaliza um telefone (qualquer formato digitado) para um link
 * `wa.me` — sem API paga, é só um deep link que abre a conversa.
 *
 * Regra: números com "+" explícito, ou que já parecem ter o DDI do Brasil
 * (começam com "55" e têm 12/13 dígitos), são respeitados como estão.
 * Números "nacionais" (10 ou 11 dígitos — DDD + telefone, o formato mais
 * comum ao digitar um número brasileiro sem pensar no DDI) recebem o "55"
 * na frente. Qualquer outra coisa é mantida como veio, para nunca destruir
 * um número internacional só porque não bate com o padrão brasileiro.
 */
export function buildWhatsAppLink(rawPhone: string | null | undefined): string | null {
  if (!rawPhone) return null;

  const hadPlus = rawPhone.trim().startsWith("+");
  const digits = rawPhone.replace(/\D/g, "");
  if (!digits) return null;

  let normalized = digits;

  if (hadPlus) {
    normalized = digits;
  } else if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    normalized = digits;
  } else if (digits.length === 10 || digits.length === 11) {
    normalized = `55${digits}`;
  }

  if (normalized.length < 8) return null;

  return `https://wa.me/${normalized}`;
}
