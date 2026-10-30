import { normalizeJson } from "./parse-json";
import { parseStructuredText } from "./parse-text";
import type { ImportBundle } from "./types";

export const MAX_IMPORT_CHARS = 1_000_000;

export type ParseResult =
  | { ok: true; bundle: ImportBundle; detected: "json" | "text" }
  | { ok: false; error: string; planning?: boolean };

/**
 * Ponto único de entrada: arquivo JSON, JSON colado ou texto estruturado.
 * JSON colado no campo de texto é reconhecido automaticamente.
 */
export function parseImportInput(content: string): ParseResult {
  if (typeof content !== "string" || !content.trim()) return { ok: false, error: "Nada para importar: envie um arquivo ou cole o texto." };
  if (content.length > MAX_IMPORT_CHARS) return { ok: false, error: "Conteúdo acima de 1 MB." };
  const trimmed = content.trim().replace(/^﻿/, "");
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let data: unknown;
    try { data = JSON.parse(trimmed); }
    catch (e) { return { ok: false, error: `JSON inválido: ${e instanceof Error ? e.message : "erro de sintaxe"}. Nenhum dado foi salvo.` }; }
    const detected = normalizeJson(data);
    if (detected.kind === "planning") return { ok: false, planning: true, error: "Este JSON é de planejamento (items). Use o importador da página Planejamento." };
    if (detected.kind === "unknown") return { ok: false, error: detected.message };
    return { ok: true, bundle: detected.bundle, detected: "json" };
  }
  return { ok: true, bundle: parseStructuredText(trimmed), detected: "text" };
}
