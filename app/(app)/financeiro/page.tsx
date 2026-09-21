import { loadFinanceiroPageData } from "@/lib/supabase/financial-page-data";
import { FinanceiroPageClient } from "@/components/visionario/financeiro/financeiro-page-client";

export default async function FinanceiroPessoalPage() {
  const data = await loadFinanceiroPageData("pessoal");
  return <FinanceiroPageClient scope="pessoal" {...data} />;
}
