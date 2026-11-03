import { redirect } from "next/navigation";

/**
 * O Planejamento saiu do menu: a importação foi para a Central de
 * Importação e os itens antigos (planning_items, nada apagado) aparecem lá.
 * Links antigos continuam funcionando.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { area } = await searchParams;
  redirect(area === "clt" ? "/importar?area=clt" : "/importar?area=pessoal");
}
