/**
 * Tipos do banco real (Supabase/Postgres) — Fase 1 (fundação).
 *
 * Espelham exatamente `supabase/migrations/001_initial_auth_spaces.sql`.
 * Ainda NÃO são usados pelo app (que continua rodando sobre
 * `mock/seed.ts` + `store/db-store.ts`). Isso é código preparado para a
 * Fase 2, quando o login mock for substituído pelo Supabase Auth.
 *
 * Não confundir com `types/entities.ts` (modelos do mock, em português —
 * `role`, `status: 'ativo'|'bloqueado'` etc.). Os nomes de campo aqui
 * seguem a migration real (`system_role`, `status: 'active'|'blocked'`,
 * snake_case). A camada que migrar cada módulo do mock para o Supabase
 * (Fase 2+) é responsável por fazer esse mapeamento — não fizemos esse
 * mapeamento ainda de propósito.
 */

export type SystemRole = "super_admin" | "user";
export type ProfileStatus = "active" | "blocked";
export type SpaceType = "personal" | "business" | "tiktok" | "other";
export type SpaceRole = "owner" | "admin" | "member" | "viewer";

// IMPORTANTE: `type`, não `interface`. O parser de `select()` do
// @supabase/postgrest-js resolve o tipo de retorno via conditional types
// profundos sobre `Schema['Tables'][T]['Row']`; quando `Row` é uma
// `interface` nomeada (em vez de um `type` com objeto literal — a mesma
// convenção que `supabase gen types typescript` sempre gera), essa cadeia
// de conditional types "trava" e resolve silenciosamente para `never` em
// vez de dar erro de compilação. Não há sinal em lugar nenhum — só builda
// exatamente com o comportamento de sempre até algo tentar ler um campo do
// resultado (`profile.status`, por exemplo), quando aí vira
// "Property 'x' does not exist on type 'never'". Comprovado isolando o
// problema em um arquivo mínimo antes de aplicar esta correção.
export type Profile = {
  id: string; // uuid, = auth.users.id
  name: string;
  avatar_url: string | null;
  phone: string | null;
  system_role: SystemRole;
  status: ProfileStatus;
  created_at: string;
  updated_at: string;
};

export type Space = {
  id: string; // uuid
  name: string;
  slug: string;
  type: SpaceType;
  owner_id: string; // uuid, references profiles.id
  created_at: string;
  updated_at: string;
};

export type SpaceMember = {
  id: string; // uuid
  space_id: string;
  user_id: string;
  role: SpaceRole;
  created_at: string;
};

/**
 * Módulos/ações do sistema de permissões por módulo (migration 003).
 * Terceiro conceito, separado de `SystemRole` (plataforma) e `SpaceRole`
 * (role bruta no space) — ver `has_module_permission()`.
 */
export type ModulePermissionModule =
  | "visao_geral"
  | "clientes"
  | "servicos"
  | "trabalhos"
  | "reunioes"
  | "vendedores"
  | "financeiro"
  | "sites";

export type ModulePermissionAction = "view" | "create" | "edit" | "delete" | "conclude";

export type MeetingStatus = "agendada" | "em_andamento" | "realizada" | "cancelada";

/** Espelha `public.meetings` (migration 003 + `client_id` da migration 005). */
export type Meeting = {
  id: string;
  space_id: string;
  title: string;
  description: string | null;
  agenda: string | null;
  notes: string | null;
  client_id: string | null;
  client_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  meeting_date: string; // date (yyyy-mm-dd)
  start_time: string; // time (HH:mm:ss)
  end_time: string | null;
  location: string | null;
  meeting_link: string | null;
  status: MeetingStatus;
  responsible_id: string;
  summary: string | null;
  decisions: string | null;
  final_notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** Espelha `public.meeting_participants` (migration 003). */
export type MeetingParticipant = {
  id: string;
  meeting_id: string;
  space_id: string;
  user_id: string;
  created_at: string;
};

/** Retorno de `space_member_profiles()` (migration 004). */
export type SpaceMemberProfile = {
  id: string;
  name: string;
  avatar_url: string | null;
};

/**
 * Espelha `public.space_module_permissions` (migration 003) — overrides
 * pontuais de permissão por módulo/ação, por membership. Ausência de linha
 * pra um (space_member, module, action) = usa o padrão da role (ver
 * `defaultModulePermission()` em `lib/module-permissions.ts`, espelho em
 * JS de `default_module_permission()` no Postgres).
 */
export type SpaceModulePermission = {
  id: string;
  space_member_id: string;
  module: ModulePermissionModule;
  action: ModulePermissionAction;
  allowed: boolean;
  created_at: string;
  updated_at: string;
};

/** Espelha `public.clients` (migration 005). */
export type ClientStatus = "ativo" | "inativo";

export type Client = {
  id: string;
  space_id: string;
  name: string;
  company: string | null;
  status: ClientStatus;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  instagram: string | null;
  tiktok: string | null;
  facebook: string | null;
  website: string | null;
  notes: string | null;
  joined_at: string; // date
  responsible_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** Espelha `public.services` (migration 005). */
export type ServiceBillingType = "unico" | "mensal";
export type ServiceStatus = "ativo" | "inativo";

export type Service = {
  id: string;
  space_id: string;
  name: string;
  description: string | null;
  default_price: number;
  billing_type: ServiceBillingType;
  status: ServiceStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** Espelha `public.client_services` (migration 005) — o "contrato". */
export type ClientServiceBillingType = "unico" | "recorrente";
export type ClientServiceFrequency = "semanal" | "mensal" | "anual";
export type ClientServiceStatus = "ativo" | "inativo" | "cancelado";

export type ClientService = {
  id: string;
  client_id: string;
  service_id: string;
  space_id: string;
  price: number;
  billing_type: ClientServiceBillingType;
  frequency: ClientServiceFrequency | null;
  due_day: number | null;
  start_date: string;
  status: ClientServiceStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/**
 * Retorno de `admin_list_users()` (migration 002) — profile + `email` e
 * `last_sign_in_at` de `auth.users` (inacessíveis diretamente pelo client,
 * mesmo com RLS, por isso vêm de uma função `security definer`).
 */
export type AdminUserRow = {
  id: string;
  name: string;
  avatar_url: string | null;
  phone: string | null;
  system_role: SystemRole;
  status: ProfileStatus;
  created_at: string;
  updated_at: string;
  email: string | null;
  last_sign_in_at: string | null;
};

/**
 * Formato mínimo esperado pelo `@supabase/ssr` / `@supabase/supabase-js`
 * para tipar `createClient<Database>()`. Cobre só as tabelas da Fase 1 —
 * cresce conforme novos módulos forem migrados do mock.
 */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; name: string };
        Update: Partial<Omit<Profile, "id">>;
        Relationships: [];
      };
      spaces: {
        Row: Space;
        Insert: Partial<Space> & { name: string; slug: string; type: SpaceType; owner_id: string };
        Update: Partial<Omit<Space, "id">>;
        Relationships: [];
      };
      space_members: {
        Row: SpaceMember;
        Insert: Partial<SpaceMember> & { space_id: string; user_id: string; role: SpaceRole };
        Update: Partial<Omit<SpaceMember, "id">>;
        Relationships: [];
      };
      meetings: {
        Row: Meeting;
        Insert: Partial<Meeting> & {
          space_id: string;
          title: string;
          meeting_date: string;
          start_time: string;
          responsible_id: string;
          created_by: string;
        };
        Update: Partial<Omit<Meeting, "id">>;
        Relationships: [];
      };
      meeting_participants: {
        Row: MeetingParticipant;
        Insert: Partial<MeetingParticipant> & { meeting_id: string; user_id: string };
        Update: Partial<Omit<MeetingParticipant, "id">>;
        Relationships: [];
      };
      space_module_permissions: {
        Row: SpaceModulePermission;
        Insert: Partial<SpaceModulePermission> & {
          space_member_id: string;
          module: ModulePermissionModule;
          action: ModulePermissionAction;
          allowed: boolean;
        };
        Update: Partial<Omit<SpaceModulePermission, "id">>;
        Relationships: [];
      };
      clients: {
        Row: Client;
        Insert: Partial<Client> & { space_id: string; name: string; created_by: string };
        Update: Partial<Omit<Client, "id">>;
        Relationships: [];
      };
      services: {
        Row: Service;
        Insert: Partial<Service> & {
          space_id: string;
          name: string;
          billing_type: ServiceBillingType;
          created_by: string;
        };
        Update: Partial<Omit<Service, "id">>;
        Relationships: [];
      };
      client_services: {
        Row: ClientService;
        Insert: Partial<ClientService> & {
          client_id: string;
          service_id: string;
          price: number;
          billing_type: ClientServiceBillingType;
          created_by: string;
        };
        Update: Partial<Omit<ClientService, "id">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      admin_list_users: {
        Args: Record<string, never>;
        Returns: AdminUserRow[];
      };
      has_module_permission: {
        Args: { p_space_id: string; p_module: string; p_action: string };
        Returns: boolean;
      };
      space_member_profiles: {
        Args: { p_space_id: string };
        Returns: SpaceMemberProfile[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
