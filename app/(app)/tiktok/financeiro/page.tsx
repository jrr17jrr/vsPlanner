import { loadFinanceiroPageData } from "@/lib/supabase/financial-page-data";
import { FinanceiroPageClient } from "@/components/visionario/financeiro/financeiro-page-client";

export default async function TikTokFinanceiroPage() {
  const data = await loadFinanceiroPageData("tiktok");
  return <FinanceiroPageClient scope="tiktok" {...data} />;
}
