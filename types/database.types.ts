/**
 * Tipos do banco real (Supabase/Postgres). Espelham as migrations em
 * `supabase/migrations/`, sempre com `type` (não `interface`) — ver o
 * comentário em `Profile` abaixo para o motivo exato.
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
 * Espelha `public.work_items` (migration 006 — ainda NÃO executada).
 * "Responsáveis" não é campo nenhum aqui: é a relação real em
 * `WorkItemAssignee` (múltiplos, mesma arquitetura de `MeetingParticipant`).
 * `source_meeting_id` liga a reunião que gerou este trabalho, quando
 * aplicável (seção "Atividades geradas" da tela de reunião).
 */
export type WorkItemPriority = "baixa" | "media" | "alta";
export type WorkItemStatus = "pendente" | "em_andamento" | "aguardando_cliente" | "concluido";

export type WorkItem = {
  id: string;
  space_id: string;
  title: string;
  description: string | null;
  client_id: string | null;
  service_id: string | null;
  source_meeting_id: string | null;
  due_date: string | null; // date (yyyy-mm-dd)
  priority: WorkItemPriority;
  status: WorkItemStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** Espelha `public.work_item_assignees` (migration 006). */
export type WorkItemAssignee = {
  id: string;
  work_item_id: string;
  space_id: string;
  user_id: string;
  created_at: string;
};

/**
 * Financeiro real (migration 007). Três camadas, nunca uma tabela só:
 * origem (a decisão) → cobrança (o que é devido, valor congelado) →
 * pagamento (o que de fato mexeu o caixa, N por cobrança). Pendente/
 * parcial/pago NUNCA é campo — é sempre calculado a partir da soma de
 * `FinancialPayment` ligados a cada `FinancialCharge` (ver
 * `lib/financial-calc.ts`).
 */
export type FinancialKind = "entrada" | "saida";
export type FinancialOriginType = "unico" | "parcelado" | "recorrente";
export type FinancialRecurrenceFrequency =
  | "semanal"
  | "mensal"
  | "a_cada_x_meses"
  | "trimestral"
  | "semestral"
  | "anual"
  | "customizado";
export type FinancialRecurrenceEndType = "nunca" | "em_data" | "apos_ocorrencias";
export type FinancialChargeStatus = "ativo" | "cancelado";
export type FinancialPaymentMethod = "pix" | "dinheiro" | "debito" | "credito" | "boleto" | "transferencia" | "outro";

export type FinancialAccount = {
  id: string;
  space_id: string;
  name: string;
  initial_balance: number;
  initial_balance_date: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type FinancialCategory = {
  id: string;
  space_id: string;
  kind: FinancialKind;
  name: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type FinancialReferenceType = {
  id: string;
  space_id: string;
  name: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type FinancialOrigin = {
  id: string;
  space_id: string;
  kind: FinancialKind;
  origin_type: FinancialOriginType;
  description: string;
  client_id: string | null;
  client_service_id: string | null;
  reference_type_id: string | null;
  category_id: string | null;
  supplier_name: string | null;
  installment_count: number | null;
  recurrence_frequency: FinancialRecurrenceFrequency | null;
  recurrence_interval: number | null;
  recurrence_end_type: FinancialRecurrenceEndType | null;
  recurrence_end_date: string | null;
  recurrence_end_occurrences: number | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type FinancialCharge = {
  id: string;
  space_id: string;
  origin_id: string;
  kind: FinancialKind;
  description: string;
  client_id: string | null;
  client_service_id: string | null;
  reference_type_id: string | null;
  category_id: string | null;
  supplier_name: string | null;
  installment_number: number | null;
  installment_total: number | null;
  original_amount: number;
  discount_amount: number;
  addition_amount: number;
  amount: number;
  due_date: string;
  competency_date: string | null;
  status: FinancialChargeStatus;
  notes: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FinancialPayment = {
  id: string;
  space_id: string;
  charge_id: string;
  amount: number;
  payment_date: string;
  payment_method: FinancialPaymentMethod;
  account_id: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/**
 * Módulos pessoais reais (migration 008) — Tarefas, Rotina, Trabalho/CLT,
 * Metas. RLS é `user_id = auth.uid()` direto (space Pessoal é sempre de
 * um usuário só, sem papéis/permissão por módulo).
 */
export type TaskPriority = "baixa" | "media" | "alta";
export type TaskStatus = "pendente" | "concluida";

export type Task = {
  id: string;
  space_id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  scheduled_time: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  category: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Espelha `public.activities` — rotina recorrente. "Concluída" nunca é
 * campo aqui, é sempre uma linha em `ActivityCompletion` por data (ver
 * abaixo) — marcar hoje nunca afeta ontem/amanhã.
 */
export type Activity = {
  id: string;
  space_id: string;
  user_id: string;
  title: string;
  category: string | null;
  /** 0=domingo .. 6=sábado (Date.getDay()). */
  weekdays: number[];
  start_time: string;
  end_time: string | null;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ActivityCompletion = {
  id: string;
  activity_id: string;
  user_id: string;
  occurrence_date: string;
  completed_at: string;
};

export type PersonalWorkTaskPriority = "baixa" | "normal" | "alta" | "urgente";
export type PersonalWorkTaskStatus = "pendente" | "concluida";

/** Espelha `public.personal_work_tasks` — Trabalho/CLT pessoal, nunca confundir com `WorkItem` (Visionário Dev). */
export type PersonalWorkTask = {
  id: string;
  space_id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  scheduled_time: string | null;
  priority: PersonalWorkTaskPriority;
  status: PersonalWorkTaskStatus;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GoalStatus = "em_andamento" | "concluida" | "cancelada";

export type Goal = {
  id: string;
  space_id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string | null;
  target_value: number | null;
  current_value: number;
  target_date: string | null;
  status: GoalStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Vendedores/Vendas/Comissões (migration 008) — colaborativo, Visionário
 * Dev, RLS via `has_module_permission(space_id, 'vendedores', ação)`.
 */
export type VendorStatus = "ativo" | "inativo";

export type Vendor = {
  id: string;
  space_id: string;
  name: string;
  contact_name: string | null;
  whatsapp: string | null;
  email: string | null;
  status: VendorStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type SaleStatus = "pendente" | "confirmada" | "cancelada";

/** Registro comercial — NUNCA gera `financial_charges` automático (evita contar receita duas vezes). */
export type Sale = {
  id: string;
  space_id: string;
  vendor_id: string;
  client_id: string | null;
  service_id: string | null;
  amount: number;
  sale_date: string;
  status: SaleStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type CommissionStatus = "pendente" | "paga";

export type Commission = {
  id: string;
  space_id: string;
  sale_id: string;
  vendor_id: string;
  percentage: number | null;
  amount: number;
  status: CommissionStatus;
  due_date: string | null;
  paid_date: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** Espelha `public.client_sites` (migration 008) — Sites & Domínios, colaborativo, módulo `sites`. */
export type ClientSiteStatus = "ativo" | "desenvolvimento" | "aguardando_cliente" | "vencendo" | "expirado" | "cancelado";

export type ClientSite = {
  id: string;
  space_id: string;
  client_id: string | null;
  project_name: string;
  url: string | null;
  domain: string | null;
  registrar: string | null;
  hosting_provider: string | null;
  plan: string | null;
  contracted_at: string | null;
  due_date: string | null;
  price: number | null;
  status: ClientSiteStatus;
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
      work_items: {
        Row: WorkItem;
        Insert: Partial<WorkItem> & { space_id: string; title: string; created_by: string };
        Update: Partial<Omit<WorkItem, "id">>;
        Relationships: [];
      };
      work_item_assignees: {
        Row: WorkItemAssignee;
        Insert: Partial<WorkItemAssignee> & { work_item_id: string; user_id: string };
        Update: Partial<Omit<WorkItemAssignee, "id">>;
        Relationships: [];
      };
      financial_accounts: {
        Row: FinancialAccount;
        Insert: Partial<FinancialAccount> & { space_id: string; name: string; created_by: string };
        Update: Partial<Omit<FinancialAccount, "id">>;
        Relationships: [];
      };
      financial_categories: {
        Row: FinancialCategory;
        Insert: Partial<FinancialCategory> & { space_id: string; kind: FinancialKind; name: string; created_by: string };
        Update: Partial<Omit<FinancialCategory, "id">>;
        Relationships: [];
      };
      financial_reference_types: {
        Row: FinancialReferenceType;
        Insert: Partial<FinancialReferenceType> & { space_id: string; name: string; created_by: string };
        Update: Partial<Omit<FinancialReferenceType, "id">>;
        Relationships: [];
      };
      financial_origins: {
        Row: FinancialOrigin;
        Insert: Partial<FinancialOrigin> & {
          space_id: string;
          kind: FinancialKind;
          origin_type: FinancialOriginType;
          description: string;
          created_by: string;
        };
        Update: Partial<Omit<FinancialOrigin, "id">>;
        Relationships: [];
      };
      financial_charges: {
        Row: FinancialCharge;
        Insert: Partial<FinancialCharge> & {
          origin_id: string;
          kind: FinancialKind;
          description: string;
          original_amount: number;
          due_date: string;
          created_by: string;
        };
        Update: Partial<Omit<FinancialCharge, "id">>;
        Relationships: [];
      };
      financial_payments: {
        Row: FinancialPayment;
        Insert: Partial<FinancialPayment> & {
          charge_id: string;
          amount: number;
          payment_date: string;
          payment_method: FinancialPaymentMethod;
          account_id: string;
          created_by: string;
        };
        Update: Partial<Omit<FinancialPayment, "id">>;
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: Partial<Task> & { space_id: string; user_id: string; title: string };
        Update: Partial<Omit<Task, "id">>;
        Relationships: [];
      };
      activities: {
        Row: Activity;
        Insert: Partial<Activity> & { space_id: string; user_id: string; title: string; start_time: string };
        Update: Partial<Omit<Activity, "id">>;
        Relationships: [];
      };
      activity_completions: {
        Row: ActivityCompletion;
        Insert: Partial<ActivityCompletion> & { activity_id: string; user_id: string; occurrence_date: string };
        Update: Partial<Omit<ActivityCompletion, "id">>;
        Relationships: [];
      };
      personal_work_tasks: {
        Row: PersonalWorkTask;
        Insert: Partial<PersonalWorkTask> & { space_id: string; user_id: string; title: string };
        Update: Partial<Omit<PersonalWorkTask, "id">>;
        Relationships: [];
      };
      goals: {
        Row: Goal;
        Insert: Partial<Goal> & { space_id: string; user_id: string; title: string };
        Update: Partial<Omit<Goal, "id">>;
        Relationships: [];
      };
      vendors: {
        Row: Vendor;
        Insert: Partial<Vendor> & { space_id: string; name: string; created_by: string };
        Update: Partial<Omit<Vendor, "id">>;
        Relationships: [];
      };
      sales: {
        Row: Sale;
        Insert: Partial<Sale> & { space_id: string; vendor_id: string; amount: number; sale_date: string; created_by: string };
        Update: Partial<Omit<Sale, "id">>;
        Relationships: [];
      };
      commissions: {
        Row: Commission;
        Insert: Partial<Commission> & { space_id: string; sale_id: string; vendor_id: string; amount: number; created_by: string };
        Update: Partial<Omit<Commission, "id">>;
        Relationships: [];
      };
      client_sites: {
        Row: ClientSite;
        Insert: Partial<ClientSite> & { space_id: string; project_name: string; created_by: string };
        Update: Partial<Omit<ClientSite, "id">>;
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
