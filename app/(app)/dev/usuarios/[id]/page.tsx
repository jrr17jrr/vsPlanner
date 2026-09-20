import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/supabase/dal";
import { adminGetUser } from "@/lib/supabase/repositories/admin.repository";
import { listMySpaces, listSpaceMembersForUser } from "@/lib/supabase/repositories/spaces.repository";
import { listModulePermissionOverrides } from "@/lib/supabase/repositories/module-permissions.repository";
import { grantSpaceAccessAction } from "@/lib/supabase/admin-spaces-actions";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { UserAccountPanel } from "@/components/dev/user-account-panel";
import { UserAccessList } from "@/components/dev/user-access-list";
import { GrantAccessForm } from "@/components/dev/grant-access-form";
import { VisionarioPermissionsPanel } from "@/components/dev/visionario-permissions-panel";
import { formatDateLong } from "@/lib/format";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile: actor } = await requireSuperAdmin();

  const [user, allSpaces, memberships] = await Promise.all([
    adminGetUser(id),
    listMySpaces(),
    listSpaceMembersForUser(id),
  ]);

  if (!user) notFound();

  const spaceNameById = new Map(allSpaces.map((s) => [s.id, s.name]));
  const memberSpaceIds = new Set(memberships.map((m) => m.space_id));
  const availableSpaces = allSpaces.filter((s) => !memberSpaceIds.has(s.id));
  const isSelf = user.id === actor.id;

  const visionarioSpace = allSpaces.find((s) => s.slug === VISIONARIO_DEV_SLUG);
  const visionarioMembership = visionarioSpace
    ? memberships.find((m) => m.space_id === visionarioSpace.id)
    : undefined;
  const visionarioOverrides = visionarioMembership
    ? await listModulePermissionOverrides(visionarioMembership.id)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={user.name}
        description={`Usuário desde ${formatDateLong(user.created_at)}${isSelf ? " · esta é a sua conta" : ""}`}
      />

      <UserAccountPanel user={user} isSelf={isSelf} />

      <UserAccessList userId={user.id} memberships={memberships} spaceNameById={spaceNameById} />

      <Card className="p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Conceder novo acesso
        </p>
        {availableSpaces.length > 0 ? (
          <GrantAccessForm
            options={availableSpaces.map((s) => ({ value: s.id, label: s.name }))}
            optionLabel="Espaço"
            onSubmit={(spaceId, role) => grantSpaceAccessAction(spaceId, user.id, role)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Este usuário já tem acesso a todos os espaços existentes.
          </p>
        )}
      </Card>

      {visionarioMembership && (
        <VisionarioPermissionsPanel
          spaceMemberId={visionarioMembership.id}
          role={visionarioMembership.role}
          overrides={visionarioOverrides}
          userId={user.id}
        />
      )}
    </div>
  );
}
