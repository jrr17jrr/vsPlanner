import { requireActiveProfile } from "@/lib/supabase/dal";
import { listMySpaces, listSpaceMembersForUser } from "@/lib/supabase/repositories/spaces.repository";
import { ConfiguracoesPageClient } from "@/components/configuracoes/configuracoes-page-client";

export default async function ConfiguracoesPage() {
  const { profile, email } = await requireActiveProfile();
  const [mySpaces, memberships] = await Promise.all([listMySpaces(), listSpaceMembersForUser(profile.id)]);

  return <ConfiguracoesPageClient profile={profile} email={email} spaces={mySpaces} memberships={memberships} />;
}
