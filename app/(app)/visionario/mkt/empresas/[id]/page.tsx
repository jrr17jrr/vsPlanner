import { CltCompanyPage } from "@/components/trabalho/pages/company-page";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string | string[] }> }) {
  const { id } = await params;
  const { aba } = await searchParams;
  return <CltCompanyPage id={id} aba={aba} module="mkt" />;
}
