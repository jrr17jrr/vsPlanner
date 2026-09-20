import Link from "next/link";
import { ShieldCheck, User2 } from "lucide-react";
import { requireSuperAdmin } from "@/lib/supabase/dal";
import { adminListUsers } from "@/lib/supabase/repositories/admin.repository";
import {
  listMySpaces,
  listAllSpaceMembers,
  listSpaceMembersForUser,
} from "@/lib/supabase/repositories/spaces.repository";
import { getActiveSpace } from "@/lib/supabase/space-context";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CreateUserDialog } from "@/components/dev/create-user-dialog";
import { ActiveSpaceSwitcher } from "@/components/dev/active-space-switcher";
import { initials, formatDate } from "@/lib/format";

export default async function PainelDevUsuariosPage() {
  const { profile: actor } = await requireSuperAdmin();

  const [users, allSpaces, allMembers, myMemberships, activeSpaceInfo] = await Promise.all([
    adminListUsers(),
    listMySpaces(),
    listAllSpaceMembers(),
    listSpaceMembersForUser(actor.id),
    getActiveSpace(),
  ]);

  const spaceNameById = new Map(allSpaces.map((s) => [s.id, s.name]));
  const mySpaces = allSpaces.filter((s) => myMemberships.some((m) => m.space_id === s.id));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Painel Dev — Usuários"
        description="Administração real de usuários e acessos (Supabase Auth)."
        actions={<CreateUserDialog />}
      />

      <ActiveSpaceSwitcher mySpaces={mySpaces} active={activeSpaceInfo.space} />

      <Card className="p-4">
        <p className="mb-3 text-sm font-medium text-foreground">Usuários ({users.length})</p>
        <div className="flex flex-col gap-2">
          {users.map((u) => {
            const memberships = allMembers.filter((m) => m.user_id === u.id);
            return (
              <Link
                key={u.id}
                href={`/dev/usuarios/${u.id}`}
                className="flex flex-col gap-3 rounded-lg border border-border p-3 transition-colors hover:border-primary/50 hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-primary/15 text-primary">
                      {initials(u.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {u.name}
                      {u.id === actor.id && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          (você)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {memberships.length === 0 && (
                    <span className="text-xs text-muted-foreground">sem espaços</span>
                  )}
                  {memberships.map((m) => (
                    <Badge key={m.id} variant="secondary">
                      {spaceNameById.get(m.space_id) ?? "?"} · {m.role}
                    </Badge>
                  ))}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={u.system_role === "super_admin" ? "default" : "secondary"}>
                    {u.system_role === "super_admin" ? (
                      <>
                        <ShieldCheck className="h-3 w-3" /> super_admin
                      </>
                    ) : (
                      <>
                        <User2 className="h-3 w-3" /> user
                      </>
                    )}
                  </Badge>
                  <Badge variant={u.status === "active" ? "success" : "destructive"}>
                    {u.status}
                  </Badge>
                  <span>desde {formatDate(u.created_at)}</span>
                  <span>
                    último acesso: {u.last_sign_in_at ? formatDate(u.last_sign_in_at) : "nunca"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
