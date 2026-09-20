import { notFound } from "next/navigation";
import { requireModulePermission } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import {
  getClient,
  listClientServices,
  listServices,
  listMeetingsForClient,
} from "@/lib/supabase/repositories/clients.repository";
import { listSpaceMemberProfiles } from "@/lib/supabase/repositories/meetings.repository";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { ClientDetailClient } from "@/components/visionario/clientes/client-detail-client";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "clientes", "view");

  const client = await getClient(id);
  // Além da RLS, confirmamos que o cliente é mesmo do Visionário Dev deste
  // usuário — nunca confiar num id vindo da URL sem checar o space.
  if (!client || client.space_id !== space.id) {
    notFound();
  }

  const [contracts, services, meetings, members, canEditClient, canDeleteClient, canCreateContract, canEditContract, canDeleteContract] =
    await Promise.all([
      listClientServices(client.id),
      listServices(space.id),
      listMeetingsForClient(client.id),
      listSpaceMemberProfiles(space.id),
      hasModulePermission(space.id, "clientes", "edit"),
      hasModulePermission(space.id, "clientes", "delete"),
      hasModulePermission(space.id, "servicos", "create"),
      hasModulePermission(space.id, "servicos", "edit"),
      hasModulePermission(space.id, "servicos", "delete"),
    ]);

  return (
    <ClientDetailClient
      client={client}
      contracts={contracts}
      services={services}
      meetings={meetings}
      members={members}
      permissions={{
        canEditClient,
        canDeleteClient,
        canCreateContract,
        canEditContract,
        canDeleteContract,
      }}
    />
  );
}
