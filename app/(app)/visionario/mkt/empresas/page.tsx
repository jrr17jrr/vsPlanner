import { CltCompaniesPage } from "@/components/trabalho/pages/simple-pages";
import { findOrBootstrapSpace, requireActiveProfile } from "@/lib/supabase/dal";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import { listClients } from "@/lib/supabase/repositories/clients.repository";
export const dynamic = "force-dynamic";
export default async function Page() {
  // Clientes da Visionário Dev (somente leitura) para vincular empresas de clientes — só com permissão de ver Clientes.
  const { profile } = await requireActiveProfile();
  const space = await findOrBootstrapSpace(VISIONARIO_DEV_SLUG, profile);
  const clients = space && (await hasModulePermission(space.id, "clientes", "view")) ? (await listClients(space.id)).map(c => ({ id: c.id, name: c.name })) : [];
  return <CltCompaniesPage module="mkt" clients={clients} />;
}
