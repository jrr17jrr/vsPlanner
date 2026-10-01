import { CltDashboard } from "@/components/trabalho/clt-dashboard";
import { getCltDashboardData } from "@/lib/supabase/repositories/clt.repository";

export default async function TrabalhoPage() {
  const data = await getCltDashboardData();
  return <CltDashboard data={data} />;
}
