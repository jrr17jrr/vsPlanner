import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/supabase/dal";
import { adminGetUser } from "@/lib/supabase/repositories/admin.repository";
import { listMySpaces, listSpaceMembersForUser } from "@/lib/supabase/repositories/spaces.repository";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { UserNameForm } from "@/components/dev/user-name-form";
import { UserStatusControl } from "@/components/dev/user-status-control";
import { UserSystemRoleControl } from "@/components/dev/user-system-role-control";
import { AccountSecurityPanel } from "@/components/dev/account-security-panel";
import { UserSpacesPanel } from "@/components/dev/user-spaces-panel";
import { initials, formatDate, formatDateLong } from "@/lib/format";

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
  const isSelf = user.id === actor.id;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={user.name}
        description={`Usuário desde ${formatDateLong(user.created_at)}${isSelf ? " · esta é a sua conta" : ""}`}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/15 text-lg text-primary">
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={user.system_role === "super_admin" ? "default" : "secondary"}>
                {user.system_role}
              </Badge>
              <Badge variant={user.status === "active" ? "success" : "destructive"}>
                {user.status}
              </Badge>
            </div>
          </div>

          <UserNameForm userId={user.id} initialName={user.name} />

          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">Criado em</p>
              <p>{formatDate(user.created_at)}</p>
            </div>
            <div>
              <p className="font-medium text-foreground">Último acesso</p>
              <p>{user.last_sign_in_at ? formatDate(user.last_sign_in_at) : "nunca"}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <UserStatusControl userId={user.id} status={user.status} isSelf={isSelf} />
            <UserSystemRoleControl userId={user.id} systemRole={user.system_role} isSelf={isSelf} />
          </div>
        </Card>

        <AccountSecurityPanel userId={user.id} email={user.email} />
      </div>

      <UserSpacesPanel
        userId={user.id}
        memberships={memberships}
        allSpaces={allSpaces}
        spaceNameById={spaceNameById}
      />
    </div>
  );
}
