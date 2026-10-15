import { loadFinanceiroPageData } from "@/lib/supabase/financial-page-data";
import { FinanceiroPageClient } from "@/components/visionario/financeiro/financeiro-page-client";
import { parseFinanceTab } from "@/lib/finance-tabs";

// Financial balances and payments must always reflect the latest database state.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function VisionarioFinanceiroPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const [{ aba }, data] = await Promise.all([searchParams, loadFinanceiroPageData("visionario")]);
  return <FinanceiroPageClient key={aba ?? "visao"} scope="visionario" initialTab={parseFinanceTab(aba)} {...data} />;
}
