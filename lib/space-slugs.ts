/**
 * Slugs estáveis dos spaces "de negócio" — usados para localizar o space
 * certo (via `spaces.slug`) sem nunca fixar um UUID no código.
 */
export const VISIONARIO_DEV_SLUG = "visionario-dev";
export const TIKTOK_SLUG = "tiktok";

/**
 * Os três "destinos" possíveis do Financeiro (migration 007 — mesma
 * arquitetura, muda só o space resolvido). Fica aqui (não em `dal.ts`,
 * que tem `import "server-only"`) porque componentes client precisam do
 * tipo — só o tipo, nunca a lógica de resolução, que é sempre server-side.
 */
export type FinancialScope = "visionario" | "tiktok" | "pessoal";
