"use server";

import { requireActiveProfile, findOrBootstrapSpace } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";

export type SearchResultGroup = "Clientes" | "Serviços" | "Reuniões" | "Trabalhos";

export type SearchResult = {
  id: string;
  label: string;
  sub?: string;
  href: string;
  group: SearchResultGroup;
};

/**
 * Busca global real — cada categoria só é consultada se o usuário tiver
 * `<módulo>.view` no space (RLS reforça de novo, mas a checagem aqui
 * evita até disparar a query). Sempre filtrado por `space_id` do
 * Visionário Dev do usuário — nunca cruza pra outro space, nunca traz
 * registro de um seed/mock antigo (não existe mais tabela dessas).
 */
export async function searchAction(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const { profile } = await requireActiveProfile();
  const space = await findOrBootstrapSpace(VISIONARIO_DEV_SLUG, profile);
  if (!space) return [];

  const supabase = await createSupabaseServerClient();
  // PostgREST usa `,`/`(`/`)` como separadores de sintaxe em `.or()` — tira
  // esses caracteres do termo digitado antes de montar o padrão, pra um
  // usuário buscando por algo com vírgula/parênteses nunca virar sintaxe
  // de filtro inválida (ou, na pior hipótese, um filtro diferente do que
  // a query pretendia).
  const safeQuery = q.replace(/[,()%]/g, "");
  if (safeQuery.length < 2) return [];
  const pattern = `%${safeQuery}%`;
  const results: SearchResult[] = [];

  const [canClientes, canServicos, canReunioes, canTrabalhos] = await Promise.all([
    hasModulePermission(space.id, "clientes", "view"),
    hasModulePermission(space.id, "servicos", "view"),
    hasModulePermission(space.id, "reunioes", "view"),
    hasModulePermission(space.id, "trabalhos", "view"),
  ]);

  if (canClientes) {
    const { data } = await supabase
      .from("clients")
      .select("id, name, company")
      .eq("space_id", space.id)
      .or(`name.ilike.${pattern},company.ilike.${pattern}`)
      .limit(5);
    (data ?? []).forEach((c) =>
      results.push({ id: c.id, label: c.name, sub: c.company ?? undefined, href: `/visionario/clientes/${c.id}`, group: "Clientes" })
    );
  }

  if (canServicos) {
    const { data } = await supabase
      .from("services")
      .select("id, name")
      .eq("space_id", space.id)
      .ilike("name", pattern)
      .limit(5);
    (data ?? []).forEach((s) => results.push({ id: s.id, label: s.name, href: "/visionario/servicos", group: "Serviços" }));
  }

  if (canReunioes) {
    const { data } = await supabase
      .from("meetings")
      .select("id, title, meeting_date")
      .eq("space_id", space.id)
      .ilike("title", pattern)
      .limit(5);
    (data ?? []).forEach((m) =>
      results.push({ id: m.id, label: m.title, sub: m.meeting_date, href: `/visionario/reunioes/${m.id}`, group: "Reuniões" })
    );
  }

  if (canTrabalhos) {
    const { data } = await supabase
      .from("work_items")
      .select("id, title")
      .eq("space_id", space.id)
      .ilike("title", pattern)
      .limit(5);
    (data ?? []).forEach((w) => results.push({ id: w.id, label: w.title, href: "/visionario/trabalhos", group: "Trabalhos" }));
  }

  return results;
}
