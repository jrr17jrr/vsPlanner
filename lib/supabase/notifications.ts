import "server-only";

import { requireActiveProfile, findOrBootstrapSpace, requirePersonalSpace } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import { getTodayMeetingsForHoje } from "@/lib/supabase/meetings-actions";
import { listWorkItems } from "@/lib/supabase/repositories/work-items.repository";
import { listFinancialCharges, listFinancialPayments } from "@/lib/supabase/repositories/financial.repository";
import { listChargesForKind } from "@/lib/financial-calc";
import { VISIONARIO_DEV_SLUG, TIKTOK_SLUG } from "@/lib/space-slugs";
import { todayKeySaoPaulo } from "@/lib/format";

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  href: string;
  urgent: boolean;
  createdAt: string;
};

/**
 * Único lugar que decide "o que precisa da sua atenção" — usado pelo sino
 * de notificações E pelo Dashboard raiz (nunca duas lógicas paralelas,
 * FASE 36). Nenhuma tabela de notificação: tudo calculado ao vivo a
 * partir de `meetings`/`work_items`/`financial_charges`, respeitando a
 * permissão de módulo de cada space antes de consultar (Financeiro sem
 * permissão nem entra na conta).
 */
export async function getNotificationItems(): Promise<NotificationItem[]> {
  const { profile } = await requireActiveProfile();
  const todayKey = todayKeySaoPaulo();
  const items: NotificationItem[] = [];

  const [visionarioSpace, tiktokSpace, personal, meetingsResult] = await Promise.all([
    findOrBootstrapSpace(VISIONARIO_DEV_SLUG, profile),
    findOrBootstrapSpace(TIKTOK_SLUG, profile),
    requirePersonalSpace(),
    getTodayMeetingsForHoje(),
  ]);

  meetingsResult.meetings.forEach((m) => {
    items.push({
      id: `meeting-${m.id}`,
      title: "Reunião hoje",
      message: `${m.title} às ${m.start_time.slice(0, 5)}`,
      href: `/visionario/reunioes/${m.id}`,
      urgent: false,
      createdAt: `${m.meeting_date}T${m.start_time}`,
    });
  });

  if (visionarioSpace && (await hasModulePermission(visionarioSpace.id, "trabalhos", "view"))) {
    const workItems = await listWorkItems(visionarioSpace.id);
    workItems
      .filter((w) => w.status !== "concluido" && w.due_date && w.due_date < todayKey)
      .forEach((w) => {
        items.push({
          id: `workitem-${w.id}`,
          title: "Trabalho atrasado",
          message: w.title,
          href: "/visionario/trabalhos",
          urgent: true,
          createdAt: w.due_date ?? w.created_at,
        });
      });
  }

  for (const [space, href] of [
    [personal.space, "/financeiro"],
    [visionarioSpace, "/visionario/financeiro"],
    [tiktokSpace, "/tiktok/financeiro"],
  ] as const) {
    if (!space) continue;
    if (!(await hasModulePermission(space.id, "financeiro", "view"))) continue;

    const [charges, payments] = await Promise.all([listFinancialCharges(space.id), listFinancialPayments(space.id)]);

    listChargesForKind(charges, payments, "saida")
      .filter((r) => r.bucket === "atrasadas")
      .forEach((r) => {
        items.push({
          id: `payable-${r.charge.id}`,
          title: "Conta a pagar atrasada",
          message: r.charge.description,
          href,
          urgent: true,
          createdAt: r.charge.due_date,
        });
      });

    listChargesForKind(charges, payments, "entrada")
      .filter((r) => r.bucket === "atrasadas")
      .forEach((r) => {
        items.push({
          id: `receivable-${r.charge.id}`,
          title: "Conta a receber atrasada",
          message: r.charge.description,
          href,
          urgent: true,
          createdAt: r.charge.due_date,
        });
      });
  }

  return items.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}
