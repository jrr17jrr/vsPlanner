import { redirect } from "next/navigation";

/** Planejamento do MKT → Central de Importação (itens antigos preservados lá). */
export default function Page() {
  redirect("/importar?area=mkt");
}
