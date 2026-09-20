import Link from "next/link";
import { requireSuperAdmin } from "@/lib/supabase/dal";
import { listMySpaces, listAllSpaceMembers } from "@/lib/supabase/repositories/spaces.repository";
import { adminListUsers } from "@/lib/supabase/repositories/admin.repository";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateSpaceDialog } from "@/components/dev/create-space-dialog";

export default async function AdminSpacesPage() {
  await requireSuperAdmin();

  const [spaces, members, users] = await Promise.all([
    listMySpaces(),
    listAllSpaceMembers(),
    adminListUsers(),
  ]);

  const userNameById = new Map(users.map((u) => [u.id, u.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Painel Dev — Spaces"
        description="Administração de espaços, proprietários e memberships."
        actions={<CreateSpaceDialog />}
      />

      <Card className="p-4">
        <p className="mb-3 text-sm font-medium text-foreground">Espaços ({spaces.length})</p>
        <div className="flex flex-col gap-2">
          {spaces.map((s) => {
            const spaceMembers = members.filter((m) => m.space_id === s.id);
            return (
              <Link
                key={s.id}
                href={`/dev/spaces/${s.id}`}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 transition-colors hover:border-primary/50 hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    slug: <code className="text-foreground">{s.slug}</code> · {s.type} · dono:{" "}
                    {userNameById.get(s.owner_id) ?? s.owner_id}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{spaceMembers.length} membro(s)</Badge>
                  {spaceMembers.map((m) => (
                    <Badge key={m.id} variant="outline">
                      {userNameById.get(m.user_id) ?? m.user_id} · {m.role}
                    </Badge>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
