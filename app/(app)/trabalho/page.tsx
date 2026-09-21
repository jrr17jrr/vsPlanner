import { requirePersonalSpace } from "@/lib/supabase/dal";
import { listPersonalWorkTasks } from "@/lib/supabase/repositories/personal.repository";
import { TrabalhoPageClient } from "@/components/trabalho/trabalho-page-client";

export default async function TrabalhoPage() {
  const { space } = await requirePersonalSpace();
  const tasks = await listPersonalWorkTasks(space.id);
  return <TrabalhoPageClient tasks={tasks} />;
}
