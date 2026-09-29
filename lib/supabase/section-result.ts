import { unstable_rethrow } from "next/navigation";

/**
 * Erro REAL de uma seção de página (normalmente um `PostgrestError`), já
 * serializável para o client. Nada é escondido: code/message/details/hint
 * vão para o terminal (console.error) e são exibidos na própria seção.
 */
export type SectionError = {
  section: string;
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
};

export type SectionResult<T> = { ok: true; data: T } | { ok: false; error: SectionError };

function field(err: unknown, key: string): string | null {
  if (err && typeof err === "object" && key in err) {
    const value = (err as Record<string, unknown>)[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

export function toSectionError(section: string, err: unknown): SectionError {
  return {
    section,
    message: field(err, "message") ?? String(err),
    code: field(err, "code"),
    details: field(err, "details"),
    hint: field(err, "hint"),
  };
}

/**
 * Carrega UMA seção independente de uma página. Se ela falhar, a falha
 * fica restrita à seção (as outras continuam carregando) — mas é logada
 * completa no servidor e devolvida para a UI mostrar. `redirect()` /
 * `notFound()` do Next continuam propagando (`unstable_rethrow`).
 */
export async function loadSection<T>(section: string, load: () => Promise<T>): Promise<SectionResult<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (err) {
    unstable_rethrow(err);
    const error = toSectionError(section, err);
    console.error(`[${section}] falha ao carregar do Supabase:`, error);
    return { ok: false, error };
  }
}
