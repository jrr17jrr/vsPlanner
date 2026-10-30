import { PageHeader } from "@/components/shared/page-header";
import { SmartImporter } from "@/components/trabalho/smart-importer";
import { getCltDashboardData } from "@/lib/supabase/repositories/clt.repository";

export default async function Page() {
  const d = await getCltDashboardData();
  return (
    <div className="space-y-4">
      <PageHeader title="Importador inteligente" description="Públicos, campanhas, conjuntos, anúncios e resultados — por arquivo JSON ou texto. Nada é gravado antes da sua confirmação." />
      <SmartImporter companies={d.companies.map(c => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
