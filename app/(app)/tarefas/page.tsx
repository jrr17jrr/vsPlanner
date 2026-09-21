import { requirePersonalSpace } from "@/lib/supabase/dal";
import { listTasks } from "@/lib/supabase/repositories/personal.repository";
import { TarefasPageClient } from "@/components/tarefas/tarefas-page-client";

export default async function TarefasPage() {
  const { space } = await requirePersonalSpace();
  const tasks = await listTasks(space.id);
  return <TarefasPageClient tasks={tasks} />;
}
