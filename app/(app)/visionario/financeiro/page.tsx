import { loadFinanceiroPageData } from "@/lib/supabase/financial-page-data";
import { FinanceiroPageClient } from "@/components/visionario/financeiro/financeiro-page-client";

export default async function VisionarioFinanceiroPage() {
  const data = await loadFinanceiroPageData("visionario");
  return <FinanceiroPageClient scope="visionario" {...data} />;
}
