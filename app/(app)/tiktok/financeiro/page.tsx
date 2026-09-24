import { loadFinanceiroPageData } from "@/lib/supabase/financial-page-data";
import { FinanceiroPageClient } from "@/components/visionario/financeiro/financeiro-page-client";
import { parseFinanceTab } from "@/lib/finance-tabs";

export default async function TikTokFinanceiroPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const [{ aba }, data] = await Promise.all([searchParams, loadFinanceiroPageData("tiktok")]);
  return <FinanceiroPageClient key={aba ?? "visao"} scope="tiktok" initialTab={parseFinanceTab(aba)} {...data} />;
}
