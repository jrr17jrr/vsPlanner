import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/supabase/dal";
import { getSpace, listSpaceMembers } from "@/lib/supabase/repositories/spaces.repository";
import { adminListUsers } from "@/lib/supabase/repositories/admin.repository";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { SpaceMembersPanel } from "@/components/dev/space-members-panel";
import { formatDateLong } from "@/lib/format";

export default async function AdminSpaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireSuperAdmin();

  const [space, members, users] = await Promise.all([
    getSpace(id),
    listSpaceMembers(id),
    adminListUsers(),
  ]);

  if (!space) notFound();

  const userById = new Map(users.map((u) => [u.id, u]));
  const ownerName = userById.get(space.owner_id)?.name ?? space.owner_id;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={space.name}
        description={`${space.type} · proprietário: ${ownerName} · criado em ${formatDateLong(space.created_at)}`}
      />

      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          Slug: <code className="text-foreground">{space.slug}</code>
        </p>
      </Card>

      <SpaceMembersPanel space={space} members={members} allUsers={users} userById={userById} />
    </div>
  );
}
