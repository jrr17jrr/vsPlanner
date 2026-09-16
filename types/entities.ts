/**
 * Modelos de dados do VSLead.
 *
 * Estes tipos são desenhados para espelhar futuras tabelas do Supabase/Postgres:
 * profiles, spaces, space_members, activities, tasks, financial_accounts,
 * transactions, financial_goals, clients, services, client_services,
 * client_payments, client_sites, work_items, vendors, sales, commissions,
 * expenses, notifications.
 *
 * Convenções:
 * - Toda entidade possui `id: string` (uuid no futuro).
 * - Entidades ligadas a um espaço possuem `spaceId`.
 * - Entidades ligadas diretamente a um usuário possuem `userId`.
 * - Datas são strings ISO (`yyyy-MM-dd` para datas, ISO completo para timestamps).
 *
 * Quando o Supabase for conectado, cada Row Level Security (RLS) policy deverá
 * garantir que: um usuário só lê/escreve dados de espaços dos quais é membro
 * (via space_members), que super_admin não seja "confiado" apenas pela UI
 * (checar role no backend), que dinheiro pessoal seja restrito ao próprio
 * usuário, e que dados de negócio sejam restritos aos membros autorizados
 * do espaço correspondente.
 */

export type Role = "super_admin" | "user";
export type SpaceRole = "owner" | "admin" | "member" | "viewer";
export type SpaceType = "personal" | "business";

export interface Profile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: Role;
  phone?: string;
  status: "ativo" | "bloqueado";
  createdAt: string;
}

export interface Space {
  id: string;
  name: string;
  slug: string;
  type: SpaceType;
  icon: string;
  color: string;
  ownerId: string;
  createdAt: string;
}

export interface SpaceMember {
  id: string;
  spaceId: string;
  userId: string;
  role: SpaceRole;
  joinedAt: string;
}

export type ActivityCategory =
  | "Pessoal"
  | "CLT"
  | "Visionário Dev"
  | "TikTok"
  | "Treino"
  | "Faculdade"
  | "Alura"
  | "Curso"
  | "Outros";

export const ACTIVITY_CATEGORIES: ActivityCategory[] = [
  "Pessoal",
  "CLT",
  "Visionário Dev",
  "TikTok",
  "Treino",
  "Faculdade",
  "Alura",
  "Curso",
  "Outros",
];

export type Priority = "baixa" | "media" | "alta";

export type RecurrenceType =
  | "nenhuma"
  | "diaria"
  | "dias_especificos"
  | "segunda_sexta"
  | "semanal";

export interface Activity {
  id: string;
  spaceId: string;
  userId: string;
  title: string;
  description?: string;
  category: ActivityCategory;
  priority: Priority;
  date: string; // yyyy-MM-dd (data-base / próxima ocorrência)
  startTime: string; // HH:mm
  endTime?: string;
  recurrence: RecurrenceType;
  recurrenceDays?: number[]; // 0 (domingo) - 6 (sábado), usado em dias_especificos
  responsibleId: string;
  status: "pendente" | "concluida";
  completedDates: string[]; // datas (yyyy-MM-dd) em que a ocorrência foi concluída
  workItemId?: string;
  createdAt: string;
}

export type TaskStatus = "pendente" | "em_andamento" | "concluida";

export interface Task {
  id: string;
  spaceId: string;
  userId: string;
  title: string;
  description?: string;
  category: string;
  priority: Priority;
  dueDate?: string;
  status: TaskStatus;
  responsibleId: string;
  clientId?: string;
  workItemId?: string;
  createdAt: string;
  completedAt?: string;
}

export type TransactionType = "entrada" | "saida";

export interface FinancialAccount {
  id: string;
  spaceId: string;
  name: string;
  type: "corrente" | "poupanca" | "carteira" | "outro";
  createdAt: string;
}

export interface Transaction {
  id: string;
  spaceId: string;
  accountId: string;
  type: TransactionType;
  description: string;
  amount: number;
  category: string;
  date: string; // yyyy-MM-dd
  recurrent: boolean;
  notes?: string;
  source?: string; // Salário, Visionário Dev, TikTok, Outros...
  createdAt: string;
}

export interface RecurringExpense {
  id: string;
  spaceId: string;
  name: string;
  amount: number;
  periodicity: "mensal" | "anual";
  nextDueDate: string;
  category: string;
  active: boolean;
}

export interface FinancialGoal {
  id: string;
  spaceId: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  status: "em_andamento" | "concluida";
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Visionário Dev
// ---------------------------------------------------------------------------

export type ClientStatus = "ativo" | "inativo";

export interface Client {
  id: string;
  spaceId: string;
  name: string;
  company?: string;
  status: ClientStatus;
  phone?: string;
  whatsapp?: string;
  email?: string;
  instagram?: string;
  tiktok?: string;
  facebook?: string;
  website?: string;
  notes?: string;
  joinedAt: string; // yyyy-MM-dd
  dueDay: number; // dia do vencimento (1-28)
  pricingMode: "individual" | "pacote";
  packagePrice?: number;
  createdAt: string;
}

export type BillingType = "unico" | "mensal" | "anual";

export interface Service {
  id: string;
  spaceId: string;
  name: string;
  description?: string;
  defaultPrice: number;
  billingType: BillingType;
  status: "ativo" | "inativo";
  createdAt: string;
}

export interface ClientService {
  id: string;
  clientId: string;
  serviceId: string;
  price: number;
  createdAt: string;
}

export type PaymentStatus = "pago" | "pendente" | "atrasado";

export interface ClientPayment {
  id: string;
  clientId: string;
  spaceId: string;
  amount: number;
  competencia: string; // "2026-09"
  dueDate: string;
  paidDate?: string;
  paymentMethod?: string;
  status: PaymentStatus;
  notes?: string;
  createdAt: string;
}

export type HostingProvider = "Vercel" | "Hostinger" | "Outra";

export interface ClientSite {
  id: string;
  clientId: string;
  siteName?: string;
  url?: string;
  domain?: string;
  status: "online" | "offline" | "em_desenvolvimento";
  hostingProvider: HostingProvider;
  hostingProviderOther?: string;
  hostingPlan?: string;
  hostingPrice?: number;
  hostingBilling: "mensal" | "anual" | "gratis";
  hostingNextRenewal?: string;
  domainRegistrar?: string;
  domainRegisteredAt?: string;
  domainRenewalDate?: string;
  domainRenewalPrice?: number;
  githubRepo?: string;
  projectUrl?: string;
  technicalNotes?: string;
}

export type WorkStatus =
  | "pendente"
  | "em_andamento"
  | "aguardando_cliente"
  | "concluido";

export interface WorkItem {
  id: string;
  spaceId: string;
  title: string;
  description?: string;
  clientId?: string;
  serviceId?: string;
  responsibleIds: string[];
  dueDate?: string;
  priority: Priority;
  status: WorkStatus;
  notes?: string;
  createdAt: string;
}

export interface Vendor {
  id: string;
  spaceId: string;
  name: string;
  whatsapp?: string;
  email?: string;
  status: "ativo" | "inativo";
  defaultCommissionPct: number;
  notes?: string;
  createdAt: string;
}

export type CommissionStatus = "pendente" | "pago";

export interface Sale {
  id: string;
  spaceId: string;
  clientId?: string;
  serviceId?: string;
  vendorId: string;
  amount: number;
  commissionPct: number;
  date: string;
  createdAt: string;
}

export interface Commission {
  id: string;
  saleId: string;
  spaceId: string;
  vendorId: string;
  amount: number;
  status: CommissionStatus;
  paidDate?: string;
}

export type ExpenseType = "fixo" | "normal" | "anual";

export interface Expense {
  id: string;
  spaceId: string;
  description: string;
  amount: number;
  category: string;
  type: ExpenseType;
  date: string;
  nextDueDate?: string;
  recurrence?: "mensal" | "anual" | "nenhuma";
  notes?: string;
  createdAt: string;
}

export type NotificationType = "vencimento" | "pagamento" | "prazo" | "sistema";

export interface Notification {
  id: string;
  userId: string;
  spaceId?: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  type: NotificationType;
  href?: string;
}
