import { requirePersonalSpace } from "@/lib/supabase/dal";
import { listGoals } from "@/lib/supabase/repositories/personal.repository";
import { MetasPageClient } from "@/components/metas/metas-page-client";

export default async function MetasPage() {
  const { space } = await requirePersonalSpace();
  const goals = await listGoals(space.id);
  return <MetasPageClient goals={goals} />;
}
