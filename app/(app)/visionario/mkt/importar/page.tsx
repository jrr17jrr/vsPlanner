import { redirect } from "next/navigation";

/** Importador do MKT → Central de Importação (mesmo motor, só empresas do MKT). */
export default function Page() {
  redirect("/importar?area=mkt&tipo=campanhas");
}
