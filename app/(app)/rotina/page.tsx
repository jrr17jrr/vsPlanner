import { requirePersonalSpace } from "@/lib/supabase/dal";
import { listActivities, listActivityCompletions } from "@/lib/supabase/repositories/personal.repository";
import { RotinaPageClient } from "@/components/rotina/rotina-page-client";
import { toDateKey } from "@/lib/format";

/**
 * Busca conclusões num intervalo largo (-90/+90 dias) de uma vez, pra
 * navegação de semana no client não precisar de round-trip a cada clique
 * — evita N+1 sem perder a interatividade instantânea que a tela já tinha.
 */
export default async function RotinaPage() {
  const { profile, space } = await requirePersonalSpace();

  const from = new Date();
  from.setDate(from.getDate() - 90);
  const to = new Date();
  to.setDate(to.getDate() + 90);

  const [activities, completions] = await Promise.all([
    listActivities(space.id),
    listActivityCompletions(profile.id, toDateKey(from), toDateKey(to)),
  ]);

  return <RotinaPageClient activities={activities} completions={completions} />;
}
