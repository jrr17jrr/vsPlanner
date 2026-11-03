import { redirect } from "next/navigation";

/** Importador do CLT → Central de Importação (mesmo motor, mesma transação). */
export default function Page() {
  redirect("/importar?area=clt&tipo=campanhas");
}
