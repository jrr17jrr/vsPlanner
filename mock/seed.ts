import { generateId } from "@/lib/ids";
import { relativeDay, relativeMonthDay, competenciaOffset } from "@/lib/dates";
import type {
  Profile,
  Space,
  SpaceMember,
  Activity,
  Task,
  WorkTask,
  FinancialAccount,
  Transaction,
  RecurringExpense,
  FinancialGoal,
  Client,
  Service,
  ClientService,
  ClientPayment,
  ClientSite,
  WorkItem,
  Vendor,
  Sale,
  Commission,
  Expense,
  Notification,
} from "@/types/entities";
import * as ID from "@/mock/ids";

export interface Database {
  profiles: Profile[];
  spaces: Space[];
  spaceMembers: SpaceMember[];
  activities: Activity[];
  tasks: Task[];
  workTasks: WorkTask[];
  financialAccounts: FinancialAccount[];
  transactions: Transaction[];
  recurringExpenses: RecurringExpense[];
  financialGoals: FinancialGoal[];
  clients: Client[];
  services: Service[];
  clientServices: ClientService[];
  clientPayments: ClientPayment[];
  clientSites: ClientSite[];
  workItems: WorkItem[];
  vendors: Vendor[];
  sales: Sale[];
  commissions: Commission[];
  expenses: Expense[];
  notifications: Notification[];
}

export function createSeedDatabase(): Database {
  const now = new Date().toISOString();

  const profiles: Profile[] = [
    {
      id: ID.USER_RICARDO,
      name: "Ricardo",
      email: "ricardo@vslead.app",
      role: "super_admin",
      phone: "(11) 98888-1010",
      status: "ativo",
      createdAt: now,
    },
    {
      id: ID.USER_TESTE,
      name: "Usuário Teste",
      email: "teste@vslead.app",
      role: "user",
      phone: "(11) 97777-2020",
      status: "ativo",
      createdAt: now,
    },
  ];

  const spaces: Space[] = [
    {
      id: ID.SPACE_RICARDO_PESSOAL,
      name: "Pessoal",
      slug: "pessoal-ricardo",
      type: "personal",
      icon: "User",
      color: "#00E1FF",
      ownerId: ID.USER_RICARDO,
      createdAt: now,
    },
    {
      id: ID.SPACE_TESTE_PESSOAL,
      name: "Pessoal",
      slug: "pessoal-teste",
      type: "personal",
      icon: "User",
      color: "#00E1FF",
      ownerId: ID.USER_TESTE,
      createdAt: now,
    },
    {
      id: ID.SPACE_VISIONARIO,
      name: "Visionário Dev",
      slug: "visionario-dev",
      type: "business",
      icon: "Rocket",
      color: "#8B5CF6",
      ownerId: ID.USER_RICARDO,
      createdAt: now,
    },
    {
      id: ID.SPACE_TIKTOK,
      name: "TikTok",
      slug: "tiktok",
      type: "business",
      icon: "Video",
      color: "#FF2D55",
      ownerId: ID.USER_RICARDO,
      createdAt: now,
    },
  ];

  const spaceMembers: SpaceMember[] = [
    { id: generateId("sm"), spaceId: ID.SPACE_RICARDO_PESSOAL, userId: ID.USER_RICARDO, role: "owner", joinedAt: now },
    { id: generateId("sm"), spaceId: ID.SPACE_VISIONARIO, userId: ID.USER_RICARDO, role: "owner", joinedAt: now },
    { id: generateId("sm"), spaceId: ID.SPACE_TIKTOK, userId: ID.USER_RICARDO, role: "owner", joinedAt: now },
    { id: generateId("sm"), spaceId: ID.SPACE_TESTE_PESSOAL, userId: ID.USER_TESTE, role: "owner", joinedAt: now },
    { id: generateId("sm"), spaceId: ID.SPACE_VISIONARIO, userId: ID.USER_TESTE, role: "member", joinedAt: now },
  ];

  // ---------------------------------------------------------------------
  // Serviços (catálogo Visionário Dev)
  // ---------------------------------------------------------------------
  const services: Service[] = [
    { id: ID.SERVICE_SITE, spaceId: ID.SPACE_VISIONARIO, name: "Site", description: "Site institucional completo", defaultPrice: 1200, billingType: "unico", status: "ativo", createdAt: now },
    { id: ID.SERVICE_LANDING, spaceId: ID.SPACE_VISIONARIO, name: "Landing Page", description: "Página única de conversão", defaultPrice: 600, billingType: "unico", status: "ativo", createdAt: now },
    { id: ID.SERVICE_INSTAGRAM, spaceId: ID.SPACE_VISIONARIO, name: "Gestão de Instagram", description: "Planejamento e postagens mensais", defaultPrice: 350, billingType: "mensal", status: "ativo", createdAt: now },
    { id: ID.SERVICE_SOCIAL_MEDIA, spaceId: ID.SPACE_VISIONARIO, name: "Social Media", description: "Gestão completa de redes sociais", defaultPrice: 450, billingType: "mensal", status: "ativo", createdAt: now },
    { id: ID.SERVICE_TRAFEGO, spaceId: ID.SPACE_VISIONARIO, name: "Tráfego Pago", description: "Gestão de campanhas Meta/Google Ads", defaultPrice: 350, billingType: "mensal", status: "ativo", createdAt: now },
    { id: ID.SERVICE_MANUTENCAO, spaceId: ID.SPACE_VISIONARIO, name: "Manutenção", description: "Manutenção mensal de site", defaultPrice: 99, billingType: "mensal", status: "ativo", createdAt: now },
    { id: ID.SERVICE_VSVITRINE, spaceId: ID.SPACE_VISIONARIO, name: "VSVitrine", description: "Vitrine virtual para pequenos negócios", defaultPrice: 79, billingType: "mensal", status: "ativo", createdAt: now },
    { id: ID.SERVICE_VSFOOD, spaceId: ID.SPACE_VISIONARIO, name: "VSFood", description: "Cardápio digital para restaurantes", defaultPrice: 89, billingType: "mensal", status: "ativo", createdAt: now },
    { id: ID.SERVICE_OUTRO, spaceId: ID.SPACE_VISIONARIO, name: "Outro", description: "Serviço avulso / personalizado", defaultPrice: 0, billingType: "unico", status: "ativo", createdAt: now },
  ];

  // ---------------------------------------------------------------------
  // Clientes
  // ---------------------------------------------------------------------
  const clients: Client[] = [
    {
      id: ID.CLIENT_PONCIANE, spaceId: ID.SPACE_VISIONARIO, name: "Ponciane", company: "Ponciane Modas",
      status: "ativo", phone: "(11) 99111-2233", whatsapp: "5511991112233", email: "contato@ponciane.com.br",
      instagram: "https://instagram.com/ponciane", website: "https://ponciane.com.br",
      notes: "Cliente antiga, gosta de conteúdo com fotos reais da loja.",
      joinedAt: relativeMonthDay(-14, 3), dueDay: 5, pricingMode: "pacote", packagePrice: 400, createdAt: now,
    },
    {
      id: ID.CLIENT_STUDIO_BELLA, spaceId: ID.SPACE_VISIONARIO, name: "Studio Bella", company: "Studio Bella Estética",
      status: "ativo", phone: "(11) 98222-3344", whatsapp: "5511982223344", email: "studiobella@gmail.com",
      instagram: "https://instagram.com/studiobella", notes: "Quer aumentar agendamentos via Instagram.",
      joinedAt: relativeMonthDay(-6, 10), dueDay: 10, pricingMode: "individual", createdAt: now,
    },
    {
      id: ID.CLIENT_AUTOPECAS, spaceId: ID.SPACE_VISIONARIO, name: "Auto Peças Nova Era", company: "Nova Era Peças e Acessórios",
      status: "ativo", phone: "(11) 97333-4455", whatsapp: "5511973334455", email: "vendas@novaerapecas.com.br",
      website: "https://novaerapecas.com.br", notes: "Site precisa de catálogo de produtos.",
      joinedAt: relativeMonthDay(-9, 20), dueDay: 15, pricingMode: "individual", createdAt: now,
    },
    {
      id: ID.CLIENT_CLINICA, spaceId: ID.SPACE_VISIONARIO, name: "Clínica VitaSorriso", company: "VitaSorriso Odontologia",
      status: "ativo", phone: "(11) 96444-5566", whatsapp: "5511964445566", email: "contato@vitasorriso.com.br",
      instagram: "https://instagram.com/vitasorriso", website: "https://vitasorriso.com.br",
      notes: "Pagamento sempre atrasa alguns dias.", joinedAt: relativeMonthDay(-4, 1), dueDay: 20,
      pricingMode: "individual", createdAt: now,
    },
    {
      id: ID.CLIENT_LOJA_KAPPA, spaceId: ID.SPACE_VISIONARIO, name: "Loja Kappa Modas", company: "Kappa Modas",
      status: "inativo", phone: "(11) 95555-6677", whatsapp: "5511955556677", email: "kappa@modas.com.br",
      notes: "Pausou serviços em julho, pode voltar em breve.", joinedAt: relativeMonthDay(-11, 8), dueDay: 8,
      pricingMode: "individual", createdAt: now,
    },
  ];

  // ---------------------------------------------------------------------
  // Serviços contratados por cliente
  // ---------------------------------------------------------------------
  const clientServices: ClientService[] = [
    { id: generateId("cs"), clientId: ID.CLIENT_PONCIANE, serviceId: ID.SERVICE_INSTAGRAM, price: 250, createdAt: now },
    { id: generateId("cs"), clientId: ID.CLIENT_PONCIANE, serviceId: ID.SERVICE_MANUTENCAO, price: 150, createdAt: now },

    { id: generateId("cs"), clientId: ID.CLIENT_STUDIO_BELLA, serviceId: ID.SERVICE_TRAFEGO, price: 350, createdAt: now },
    { id: generateId("cs"), clientId: ID.CLIENT_STUDIO_BELLA, serviceId: ID.SERVICE_MANUTENCAO, price: 99, createdAt: now },

    { id: generateId("cs"), clientId: ID.CLIENT_AUTOPECAS, serviceId: ID.SERVICE_MANUTENCAO, price: 99, createdAt: now },

    { id: generateId("cs"), clientId: ID.CLIENT_CLINICA, serviceId: ID.SERVICE_SOCIAL_MEDIA, price: 450, createdAt: now },

    { id: generateId("cs"), clientId: ID.CLIENT_LOJA_KAPPA, serviceId: ID.SERVICE_INSTAGRAM, price: 250, createdAt: now },
  ];

  // ---------------------------------------------------------------------
  // Pagamentos (últimos 3 meses por cliente)
  // ---------------------------------------------------------------------
  const clientPayments: ClientPayment[] = [];
  function pushPayments(
    clientId: string,
    monthlyAmount: number,
    dueDay: number,
    statuses: Array<"pago" | "pendente" | "atrasado">
  ) {
    statuses.forEach((status, idx) => {
      const monthOffset = -(statuses.length - 1 - idx); // mais antigo primeiro
      clientPayments.push({
        id: generateId("pay"),
        clientId,
        spaceId: ID.SPACE_VISIONARIO,
        amount: monthlyAmount,
        competencia: competenciaOffset(monthOffset),
        dueDate: relativeMonthDay(monthOffset, dueDay),
        paidDate: status === "pago" ? relativeMonthDay(monthOffset, Math.max(1, dueDay - 1)) : undefined,
        paymentMethod: status === "pago" ? "Pix" : undefined,
        status,
        createdAt: now,
      });
    });
  }

  pushPayments(ID.CLIENT_PONCIANE, 400, 5, ["pago", "pago", "pago"]);
  pushPayments(ID.CLIENT_STUDIO_BELLA, 449, 10, ["pago", "pago", "pendente"]);
  pushPayments(ID.CLIENT_AUTOPECAS, 99, 15, ["pago", "atrasado", "pendente"]);
  pushPayments(ID.CLIENT_CLINICA, 450, 20, ["atrasado", "pago", "atrasado"]);
  pushPayments(ID.CLIENT_LOJA_KAPPA, 250, 8, ["pago", "pago", "pendente"]);

  // ---------------------------------------------------------------------
  // Sites & domínios
  // ---------------------------------------------------------------------
  const clientSites: ClientSite[] = [
    {
      id: generateId("site"), clientId: ID.CLIENT_PONCIANE, siteName: "Ponciane", url: "https://ponciane.com.br",
      domain: "ponciane.com.br", status: "online", hostingProvider: "Vercel", hostingPlan: "Pro",
      hostingPrice: 0, hostingBilling: "gratis", hostingNextRenewal: undefined,
      domainRegistrar: "Registro.br", domainRegisteredAt: relativeMonthDay(-14, 3),
      domainRenewalDate: relativeDay(330), domainRenewalPrice: 40,
      githubRepo: "https://github.com/visionariodev/ponciane", projectUrl: "https://ponciane.com.br",
      technicalNotes: "Next.js + Tailwind, deploy automático via GitHub.",
    },
    {
      id: generateId("site"), clientId: ID.CLIENT_AUTOPECAS, siteName: "Nova Era Peças", url: "https://novaerapecas.com.br",
      domain: "novaerapecas.com.br", status: "online", hostingProvider: "Hostinger", hostingPlan: "Premium",
      hostingPrice: 25, hostingBilling: "mensal", hostingNextRenewal: relativeDay(7),
      domainRegistrar: "Registro.br", domainRegisteredAt: relativeMonthDay(-9, 20),
      domainRenewalDate: relativeDay(18), domainRenewalPrice: 40,
      githubRepo: "https://github.com/visionariodev/novaera", projectUrl: "https://novaerapecas.com.br",
      technicalNotes: "Catálogo de produtos em desenvolvimento.",
    },
    {
      id: generateId("site"), clientId: ID.CLIENT_CLINICA, siteName: "VitaSorriso", url: "https://vitasorriso.com.br",
      domain: "vitasorriso.com.br", status: "online", hostingProvider: "Vercel", hostingPlan: "Hobby",
      hostingPrice: 0, hostingBilling: "gratis",
      domainRegistrar: "Registro.br", domainRegisteredAt: relativeMonthDay(-4, 1),
      domainRenewalDate: relativeDay(300), domainRenewalPrice: 40,
      projectUrl: "https://vitasorriso.com.br",
    },
  ];

  // ---------------------------------------------------------------------
  // Vendedores, vendas e comissões
  // ---------------------------------------------------------------------
  const vendors: Vendor[] = [
    { id: ID.VENDOR_MARCOS, spaceId: ID.SPACE_VISIONARIO, name: "Marcos Silva", whatsapp: "5511990001122", email: "marcos@vendas.com", status: "ativo", defaultCommissionPct: 20, notes: "Foco em clínicas e comércio local.", createdAt: now },
    { id: ID.VENDOR_ANA, spaceId: ID.SPACE_VISIONARIO, name: "Ana Torres", whatsapp: "5511990003344", email: "ana@vendas.com", status: "ativo", defaultCommissionPct: 15, notes: "Indicações via Instagram.", createdAt: now },
  ];

  const sales: Sale[] = [
    { id: generateId("sale"), spaceId: ID.SPACE_VISIONARIO, clientId: ID.CLIENT_CLINICA, serviceId: ID.SERVICE_SOCIAL_MEDIA, vendorId: ID.VENDOR_MARCOS, amount: 450, commissionPct: 20, date: relativeMonthDay(-3, 2), createdAt: now },
    { id: generateId("sale"), spaceId: ID.SPACE_VISIONARIO, clientId: ID.CLIENT_AUTOPECAS, serviceId: ID.SERVICE_SITE, vendorId: ID.VENDOR_MARCOS, amount: 1200, commissionPct: 20, date: relativeMonthDay(-9, 18), createdAt: now },
    { id: generateId("sale"), spaceId: ID.SPACE_VISIONARIO, clientId: ID.CLIENT_STUDIO_BELLA, serviceId: ID.SERVICE_TRAFEGO, vendorId: ID.VENDOR_ANA, amount: 350, commissionPct: 15, date: relativeMonthDay(-6, 9), createdAt: now },
    { id: generateId("sale"), spaceId: ID.SPACE_VISIONARIO, clientId: ID.CLIENT_LOJA_KAPPA, serviceId: ID.SERVICE_INSTAGRAM, vendorId: ID.VENDOR_ANA, amount: 250, commissionPct: 15, date: relativeMonthDay(-11, 6), createdAt: now },
    { id: generateId("sale"), spaceId: ID.SPACE_VISIONARIO, clientId: ID.CLIENT_PONCIANE, serviceId: ID.SERVICE_MANUTENCAO, vendorId: ID.VENDOR_MARCOS, amount: 150, commissionPct: 10, date: relativeDay(-4), createdAt: now },
  ];

  const commissions: Commission[] = sales.map((sale, idx) => ({
    id: generateId("comm"),
    saleId: sale.id,
    spaceId: ID.SPACE_VISIONARIO,
    vendorId: sale.vendorId,
    amount: Math.round(((sale.amount * sale.commissionPct) / 100) * 100) / 100,
    status: idx < 3 ? "pago" : "pendente",
    paidDate: idx < 3 ? relativeDay(-2 - idx) : undefined,
  }));

  // ---------------------------------------------------------------------
  // Trabalhos
  // ---------------------------------------------------------------------
  const workItems: WorkItem[] = [
    { id: generateId("work"), spaceId: ID.SPACE_VISIONARIO, title: "Finalizar site Ponciane", description: "Ajustar seção de produtos e formulário de contato.", clientId: ID.CLIENT_PONCIANE, serviceId: ID.SERVICE_SITE, responsibleIds: [ID.USER_RICARDO], dueDate: relativeDay(4), priority: "alta", status: "em_andamento", createdAt: now },
    { id: generateId("work"), spaceId: ID.SPACE_VISIONARIO, title: "Criar posts do mês", description: "8 posts + 4 stories para redes sociais.", clientId: ID.CLIENT_CLINICA, serviceId: ID.SERVICE_SOCIAL_MEDIA, responsibleIds: [ID.USER_TESTE], dueDate: relativeDay(2), priority: "media", status: "pendente", createdAt: now },
    { id: generateId("work"), spaceId: ID.SPACE_VISIONARIO, title: "Configurar campanha de tráfego", description: "Nova campanha de captação para o Studio Bella.", clientId: ID.CLIENT_STUDIO_BELLA, serviceId: ID.SERVICE_TRAFEGO, responsibleIds: [ID.USER_RICARDO, ID.USER_TESTE], dueDate: relativeDay(6), priority: "alta", status: "pendente", createdAt: now },
    { id: generateId("work"), spaceId: ID.SPACE_VISIONARIO, title: "Montar catálogo de produtos", description: "Estruturar catálogo com fotos enviadas pelo cliente.", clientId: ID.CLIENT_AUTOPECAS, serviceId: ID.SERVICE_SITE, responsibleIds: [ID.USER_RICARDO], dueDate: relativeDay(10), priority: "media", status: "aguardando_cliente", createdAt: now },
    { id: generateId("work"), spaceId: ID.SPACE_VISIONARIO, title: "Renovar domínio Nova Era Peças", description: "Renovação antes do vencimento.", clientId: ID.CLIENT_AUTOPECAS, responsibleIds: [ID.USER_RICARDO], dueDate: relativeDay(18), priority: "baixa", status: "pendente", createdAt: now },
    { id: generateId("work"), spaceId: ID.SPACE_VISIONARIO, title: "Proposta comercial Kappa Modas", description: "Enviar nova proposta para reativação.", clientId: ID.CLIENT_LOJA_KAPPA, responsibleIds: [ID.USER_RICARDO], dueDate: relativeDay(-1), priority: "media", status: "pendente", createdAt: now },
    { id: generateId("work"), spaceId: ID.SPACE_VISIONARIO, title: "Landing page campanha de aniversário", description: "Landing page para promoção especial.", clientId: ID.CLIENT_PONCIANE, serviceId: ID.SERVICE_LANDING, responsibleIds: [ID.USER_TESTE], dueDate: relativeDay(-3), priority: "alta", status: "concluido", createdAt: now },
  ];

  // ---------------------------------------------------------------------
  // Rotina — atividades (espaço = espaço pessoal do responsável)
  // ---------------------------------------------------------------------
  const weekStartKey = relativeDay(-(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1));

  const activities: Activity[] = [
    // Ricardo
    { id: generateId("act"), spaceId: ID.SPACE_RICARDO_PESSOAL, userId: ID.USER_RICARDO, title: "Tomar creatina", category: "Pessoal", priority: "baixa", date: weekStartKey, startTime: "06:35", recurrence: "diaria", responsibleId: ID.USER_RICARDO, status: "pendente", completedDates: [relativeDay(-1), relativeDay(-2)], createdAt: now },
    { id: generateId("act"), spaceId: ID.SPACE_RICARDO_PESSOAL, userId: ID.USER_RICARDO, title: "Trabalho / CLT", category: "Trabalho / CLT", priority: "alta", date: weekStartKey, startTime: "08:00", endTime: "17:00", recurrence: "segunda_sexta", responsibleId: ID.USER_RICARDO, status: "pendente", completedDates: [relativeDay(-1), relativeDay(-2), relativeDay(-3)], createdAt: now },
    { id: generateId("act"), spaceId: ID.SPACE_RICARDO_PESSOAL, userId: ID.USER_RICARDO, title: "Responder clientes", description: "Checar WhatsApp e e-mails da Visionário Dev.", category: "Visionário Dev", priority: "media", date: weekStartKey, startTime: "12:30", endTime: "13:00", recurrence: "segunda_sexta", responsibleId: ID.USER_RICARDO, status: "pendente", completedDates: [relativeDay(-1)], createdAt: now },
    { id: generateId("act"), spaceId: ID.SPACE_RICARDO_PESSOAL, userId: ID.USER_RICARDO, title: "Finalizar site Ponciane", category: "Visionário Dev", priority: "alta", date: relativeDay(0), startTime: "17:30", endTime: "19:00", recurrence: "dias_especificos", recurrenceDays: [1, 3, 5], responsibleId: ID.USER_RICARDO, status: "pendente", completedDates: [], workItemId: workItems[0].id, createdAt: now },
    { id: generateId("act"), spaceId: ID.SPACE_RICARDO_PESSOAL, userId: ID.USER_RICARDO, title: "Gravar/editar TikTok", category: "TikTok", priority: "media", date: weekStartKey, startTime: "19:00", endTime: "20:00", recurrence: "dias_especificos", recurrenceDays: [2, 4], responsibleId: ID.USER_RICARDO, status: "pendente", completedDates: [], createdAt: now },
    { id: generateId("act"), spaceId: ID.SPACE_RICARDO_PESSOAL, userId: ID.USER_RICARDO, title: "Treino", category: "Treino", priority: "media", date: weekStartKey, startTime: "20:00", endTime: "21:00", recurrence: "segunda_sexta", responsibleId: ID.USER_RICARDO, status: "pendente", completedDates: [relativeDay(-1), relativeDay(-2)], createdAt: now },
    { id: generateId("act"), spaceId: ID.SPACE_RICARDO_PESSOAL, userId: ID.USER_RICARDO, title: "Faculdade", category: "Faculdade", priority: "alta", date: weekStartKey, startTime: "22:00", endTime: "23:30", recurrence: "dias_especificos", recurrenceDays: [1, 3], responsibleId: ID.USER_RICARDO, status: "pendente", completedDates: [], createdAt: now },
    { id: generateId("act"), spaceId: ID.SPACE_RICARDO_PESSOAL, userId: ID.USER_RICARDO, title: "Estudar na Alura", category: "Alura", priority: "baixa", date: weekStartKey, startTime: "10:00", endTime: "11:00", recurrence: "dias_especificos", recurrenceDays: [6], responsibleId: ID.USER_RICARDO, status: "pendente", completedDates: [], createdAt: now },

    // Usuário Teste
    { id: generateId("act"), spaceId: ID.SPACE_TESTE_PESSOAL, userId: ID.USER_TESTE, title: "Trabalho / CLT", category: "Trabalho / CLT", priority: "alta", date: weekStartKey, startTime: "08:00", endTime: "16:00", recurrence: "segunda_sexta", responsibleId: ID.USER_TESTE, status: "pendente", completedDates: [relativeDay(-1), relativeDay(-2)], createdAt: now },
    { id: generateId("act"), spaceId: ID.SPACE_TESTE_PESSOAL, userId: ID.USER_TESTE, title: "Criar posts do mês (VitaSorriso)", category: "Visionário Dev", priority: "media", date: relativeDay(1), startTime: "18:00", endTime: "19:30", recurrence: "nenhuma", responsibleId: ID.USER_TESTE, status: "pendente", completedDates: [], workItemId: workItems[1].id, createdAt: now },
    { id: generateId("act"), spaceId: ID.SPACE_TESTE_PESSOAL, userId: ID.USER_TESTE, title: "Yoga", category: "Treino", priority: "baixa", date: weekStartKey, startTime: "19:30", endTime: "20:15", recurrence: "dias_especificos", recurrenceDays: [2, 4], responsibleId: ID.USER_TESTE, status: "pendente", completedDates: [relativeDay(-2)], createdAt: now },
    { id: generateId("act"), spaceId: ID.SPACE_TESTE_PESSOAL, userId: ID.USER_TESTE, title: "Curso de Design", category: "Curso", priority: "media", date: weekStartKey, startTime: "20:30", endTime: "22:00", recurrence: "dias_especificos", recurrenceDays: [1, 3], responsibleId: ID.USER_TESTE, status: "pendente", completedDates: [], createdAt: now },
  ];

  // ---------------------------------------------------------------------
  // Tarefas
  // ---------------------------------------------------------------------
  const tasks: Task[] = [
    { id: generateId("task"), spaceId: ID.SPACE_VISIONARIO, userId: ID.USER_RICARDO, title: "Comprar domínio para novo cliente", category: "Visionário Dev", priority: "media", dueDate: relativeDay(3), status: "pendente", responsibleId: ID.USER_RICARDO, createdAt: now },
    { id: generateId("task"), spaceId: ID.SPACE_VISIONARIO, userId: ID.USER_RICARDO, title: "Enviar proposta para Kappa Modas", category: "Visionário Dev", priority: "alta", dueDate: relativeDay(-1), status: "em_andamento", responsibleId: ID.USER_RICARDO, clientId: ID.CLIENT_LOJA_KAPPA, createdAt: now },
    { id: generateId("task"), spaceId: ID.SPACE_VISIONARIO, userId: ID.USER_RICARDO, title: "Responder cliente Auto Peças sobre catálogo", category: "Visionário Dev", priority: "media", dueDate: relativeDay(1), status: "pendente", responsibleId: ID.USER_RICARDO, clientId: ID.CLIENT_AUTOPECAS, workItemId: workItems[3].id, createdAt: now },
    { id: generateId("task"), spaceId: ID.SPACE_VISIONARIO, userId: ID.USER_TESTE, title: "Editar vídeo institucional VitaSorriso", category: "Visionário Dev", priority: "media", dueDate: relativeDay(2), status: "pendente", responsibleId: ID.USER_TESTE, clientId: ID.CLIENT_CLINICA, createdAt: now },
    { id: generateId("task"), spaceId: ID.SPACE_VISIONARIO, userId: ID.USER_TESTE, title: "Alterar cores do site Ponciane", category: "Visionário Dev", priority: "baixa", dueDate: relativeDay(5), status: "pendente", responsibleId: ID.USER_TESTE, clientId: ID.CLIENT_PONCIANE, workItemId: workItems[0].id, createdAt: now },
    { id: generateId("task"), spaceId: ID.SPACE_RICARDO_PESSOAL, userId: ID.USER_RICARDO, title: "Renovar plano da academia", category: "Pessoal", priority: "baixa", dueDate: relativeDay(6), status: "pendente", responsibleId: ID.USER_RICARDO, createdAt: now },
    { id: generateId("task"), spaceId: ID.SPACE_RICARDO_PESSOAL, userId: ID.USER_RICARDO, title: "Estudar para prova da faculdade", category: "Faculdade", priority: "alta", dueDate: relativeDay(2), status: "em_andamento", responsibleId: ID.USER_RICARDO, createdAt: now },
    { id: generateId("task"), spaceId: ID.SPACE_TESTE_PESSOAL, userId: ID.USER_TESTE, title: "Organizar planejamento semanal", category: "Pessoal", priority: "media", dueDate: relativeDay(1), status: "pendente", responsibleId: ID.USER_TESTE, createdAt: now },
    { id: generateId("task"), spaceId: ID.SPACE_RICARDO_PESSOAL, userId: ID.USER_RICARDO, title: "Planejar roteiro de vídeos da semana", category: "TikTok", priority: "media", dueDate: relativeDay(0), status: "concluida", responsibleId: ID.USER_RICARDO, completedAt: relativeDay(-1), createdAt: now },
  ];

  // ---------------------------------------------------------------------
  // Trabalho / CLT — tarefas do emprego, separadas da Visionário Dev
  // ---------------------------------------------------------------------
  const workTasks: WorkTask[] = [
    { id: generateId("wtask"), spaceId: ID.SPACE_RICARDO_PESSOAL, userId: ID.USER_RICARDO, title: "Conferir pedidos", priority: "normal", status: "concluida", dueDate: relativeDay(0), completedAt: relativeDay(0), createdAt: now },
    { id: generateId("wtask"), spaceId: ID.SPACE_RICARDO_PESSOAL, userId: ID.USER_RICARDO, title: "Atualizar planilha", priority: "normal", status: "concluida", dueDate: relativeDay(0), completedAt: relativeDay(0), createdAt: now },
    { id: generateId("wtask"), spaceId: ID.SPACE_RICARDO_PESSOAL, userId: ID.USER_RICARDO, title: "Falar com responsável", priority: "baixa", status: "concluida", dueDate: relativeDay(0), completedAt: relativeDay(0), createdAt: now },
    { id: generateId("wtask"), spaceId: ID.SPACE_RICARDO_PESSOAL, userId: ID.USER_RICARDO, title: "Resolver problema no sistema interno", priority: "urgente", status: "pendente", dueDate: relativeDay(0), createdAt: now },
    { id: generateId("wtask"), spaceId: ID.SPACE_RICARDO_PESSOAL, userId: ID.USER_RICARDO, title: "Finalizar relatório mensal", priority: "alta", status: "pendente", dueDate: relativeDay(0), createdAt: now },
    { id: generateId("wtask"), spaceId: ID.SPACE_RICARDO_PESSOAL, userId: ID.USER_RICARDO, title: "Enviar informação para o RH", priority: "normal", status: "pendente", dueDate: relativeDay(1), createdAt: now },
    { id: generateId("wtask"), spaceId: ID.SPACE_TESTE_PESSOAL, userId: ID.USER_TESTE, title: "Organizar arquivos do setor", priority: "normal", status: "pendente", dueDate: relativeDay(0), createdAt: now },
  ];

  // ---------------------------------------------------------------------
  // Financeiro pessoal
  // ---------------------------------------------------------------------
  const financialAccounts: FinancialAccount[] = [
    { id: ID.ACCOUNT_RICARDO, spaceId: ID.SPACE_RICARDO_PESSOAL, name: "Conta principal", type: "corrente", createdAt: now },
    { id: ID.ACCOUNT_TESTE, spaceId: ID.SPACE_TESTE_PESSOAL, name: "Conta principal", type: "corrente", createdAt: now },
    { id: ID.ACCOUNT_TIKTOK, spaceId: ID.SPACE_TIKTOK, name: "Conta TikTok", type: "outro", createdAt: now },
  ];

  const transactions: Transaction[] = [];

  function pushMonth(monthOffset: number) {
    transactions.push(
      { id: generateId("txn"), spaceId: ID.SPACE_RICARDO_PESSOAL, accountId: ID.ACCOUNT_RICARDO, type: "entrada", description: "Salário CLT", amount: 3200, category: "Salário", date: relativeMonthDay(monthOffset, 5), recurrent: true, source: "Salário", createdAt: now },
      { id: generateId("txn"), spaceId: ID.SPACE_RICARDO_PESSOAL, accountId: ID.ACCOUNT_RICARDO, type: "entrada", description: "Repasse Visionário Dev", amount: 1450, category: "Visionário Dev", date: relativeMonthDay(monthOffset, 8), recurrent: false, source: "Visionário Dev", createdAt: now },
      { id: generateId("txn"), spaceId: ID.SPACE_RICARDO_PESSOAL, accountId: ID.ACCOUNT_RICARDO, type: "entrada", description: "Repasse TikTok", amount: 380, category: "TikTok", date: relativeMonthDay(monthOffset, 12), recurrent: false, source: "TikTok", createdAt: now },
      { id: generateId("txn"), spaceId: ID.SPACE_RICARDO_PESSOAL, accountId: ID.ACCOUNT_RICARDO, type: "saida", description: "Aluguel", amount: 950, category: "Moradia", date: relativeMonthDay(monthOffset, 6), recurrent: true, createdAt: now },
      { id: generateId("txn"), spaceId: ID.SPACE_RICARDO_PESSOAL, accountId: ID.ACCOUNT_RICARDO, type: "saida", description: "Mercado", amount: 480, category: "Alimentação", date: relativeMonthDay(monthOffset, 10), recurrent: false, createdAt: now },
      { id: generateId("txn"), spaceId: ID.SPACE_RICARDO_PESSOAL, accountId: ID.ACCOUNT_RICARDO, type: "saida", description: "Faculdade", amount: 420, category: "Educação", date: relativeMonthDay(monthOffset, 15), recurrent: true, createdAt: now },
      { id: generateId("txn"), spaceId: ID.SPACE_RICARDO_PESSOAL, accountId: ID.ACCOUNT_RICARDO, type: "saida", description: "Academia", amount: 99, category: "Saúde", date: relativeMonthDay(monthOffset, 3), recurrent: true, createdAt: now },
      { id: generateId("txn"), spaceId: ID.SPACE_RICARDO_PESSOAL, accountId: ID.ACCOUNT_RICARDO, type: "saida", description: "Assinaturas (Netflix, Spotify)", amount: 65, category: "Assinaturas", date: relativeMonthDay(monthOffset, 2), recurrent: true, createdAt: now },
      { id: generateId("txn"), spaceId: ID.SPACE_RICARDO_PESSOAL, accountId: ID.ACCOUNT_RICARDO, type: "saida", description: "Transporte", amount: 180, category: "Transporte", date: relativeMonthDay(monthOffset, 20), recurrent: false, createdAt: now }
    );

    transactions.push(
      { id: generateId("txn"), spaceId: ID.SPACE_TESTE_PESSOAL, accountId: ID.ACCOUNT_TESTE, type: "entrada", description: "Salário CLT", amount: 2400, category: "Salário", date: relativeMonthDay(monthOffset, 5), recurrent: true, source: "Salário", createdAt: now },
      { id: generateId("txn"), spaceId: ID.SPACE_TESTE_PESSOAL, accountId: ID.ACCOUNT_TESTE, type: "saida", description: "Aluguel", amount: 700, category: "Moradia", date: relativeMonthDay(monthOffset, 6), recurrent: true, createdAt: now },
      { id: generateId("txn"), spaceId: ID.SPACE_TESTE_PESSOAL, accountId: ID.ACCOUNT_TESTE, type: "saida", description: "Curso de Design", amount: 150, category: "Educação", date: relativeMonthDay(monthOffset, 12), recurrent: true, createdAt: now }
    );

    transactions.push(
      { id: generateId("txn"), spaceId: ID.SPACE_TIKTOK, accountId: ID.ACCOUNT_TIKTOK, type: "entrada", description: "Fundo de criador", amount: 620, category: "Plataforma", date: relativeMonthDay(monthOffset, 9), recurrent: false, createdAt: now },
      { id: generateId("txn"), spaceId: ID.SPACE_TIKTOK, accountId: ID.ACCOUNT_TIKTOK, type: "entrada", description: "Parceria de marca", amount: 300, category: "Parcerias", date: relativeMonthDay(monthOffset, 22), recurrent: false, createdAt: now },
      { id: generateId("txn"), spaceId: ID.SPACE_TIKTOK, accountId: ID.ACCOUNT_TIKTOK, type: "saida", description: "Edição de vídeos (freelancer)", amount: 150, category: "Produção", date: relativeMonthDay(monthOffset, 18), recurrent: false, createdAt: now },
      { id: generateId("txn"), spaceId: ID.SPACE_TIKTOK, accountId: ID.ACCOUNT_TIKTOK, type: "saida", description: "Equipamento (luz/microfone)", amount: 90, category: "Equipamento", date: relativeMonthDay(monthOffset, 25), recurrent: false, createdAt: now }
    );
  }

  pushMonth(-2);
  pushMonth(-1);
  pushMonth(0);

  const recurringExpenses: RecurringExpense[] = [
    { id: generateId("rec"), spaceId: ID.SPACE_RICARDO_PESSOAL, name: "Netflix + Spotify", amount: 65, periodicity: "mensal", nextDueDate: relativeDay(5), category: "Assinaturas", active: true },
    { id: generateId("rec"), spaceId: ID.SPACE_RICARDO_PESSOAL, name: "Academia", amount: 99, periodicity: "mensal", nextDueDate: relativeDay(9), category: "Saúde", active: true },
    { id: generateId("rec"), spaceId: ID.SPACE_RICARDO_PESSOAL, name: "Faculdade", amount: 420, periodicity: "mensal", nextDueDate: relativeDay(12), category: "Educação", active: true },
  ];

  const financialGoals: FinancialGoal[] = [
    { id: generateId("goal"), spaceId: ID.SPACE_RICARDO_PESSOAL, title: "Notebook novo", targetAmount: 7000, currentAmount: 3000, deadline: relativeDay(120), status: "em_andamento", createdAt: now },
    { id: generateId("goal"), spaceId: ID.SPACE_RICARDO_PESSOAL, title: "Reserva de emergência", targetAmount: 10000, currentAmount: 5000, deadline: relativeDay(240), status: "em_andamento", createdAt: now },
    { id: generateId("goal"), spaceId: ID.SPACE_TESTE_PESSOAL, title: "Viagem de fim de ano", targetAmount: 3000, currentAmount: 900, deadline: relativeDay(150), status: "em_andamento", createdAt: now },
  ];

  // ---------------------------------------------------------------------
  // Financeiro Visionário Dev — gastos
  // ---------------------------------------------------------------------
  const expenses: Expense[] = [
    { id: generateId("exp"), spaceId: ID.SPACE_VISIONARIO, description: "Ferramentas (Canva, ChatGPT Plus)", amount: 120, category: "Ferramentas", type: "fixo", date: relativeMonthDay(0, 1), nextDueDate: relativeDay(15), recurrence: "mensal", createdAt: now },
    { id: generateId("exp"), spaceId: ID.SPACE_VISIONARIO, description: "Hospedagem revenda (Hostinger)", amount: 60, category: "Hospedagem", type: "fixo", date: relativeMonthDay(0, 3), nextDueDate: relativeDay(20), recurrence: "mensal", createdAt: now },
    { id: generateId("exp"), spaceId: ID.SPACE_VISIONARIO, description: "Assinatura Figma", amount: 45, category: "Ferramentas", type: "fixo", date: relativeMonthDay(0, 5), nextDueDate: relativeDay(25), recurrence: "mensal", createdAt: now },
    { id: generateId("exp"), spaceId: ID.SPACE_VISIONARIO, description: "Anúncios Meta Ads (teste de campanha)", amount: 250, category: "Marketing", type: "normal", date: relativeDay(-6), recurrence: "nenhuma", createdAt: now },
    { id: generateId("exp"), spaceId: ID.SPACE_VISIONARIO, description: "Freelancer (edição de vídeo)", amount: 180, category: "Equipe", type: "normal", date: relativeDay(-10), recurrence: "nenhuma", createdAt: now },
    { id: generateId("exp"), spaceId: ID.SPACE_VISIONARIO, description: "Compra de mouse e teclado", amount: 320, category: "Equipamento", type: "normal", date: relativeMonthDay(-1, 14), recurrence: "nenhuma", createdAt: now },
    { id: generateId("exp"), spaceId: ID.SPACE_VISIONARIO, description: "Domínio visionariodev.com.br", amount: 40, category: "Domínio", type: "anual", date: relativeMonthDay(-8, 1), nextDueDate: relativeDay(45), recurrence: "anual", createdAt: now },
    { id: generateId("exp"), spaceId: ID.SPACE_VISIONARIO, description: "Licença de ícones/plugins", amount: 180, category: "Licenças", type: "anual", date: relativeMonthDay(-3, 1), nextDueDate: relativeDay(260), recurrence: "anual", createdAt: now },
  ];

  // ---------------------------------------------------------------------
  // Notificações
  // ---------------------------------------------------------------------
  const notifications: Notification[] = [
    { id: generateId("notif"), userId: ID.USER_RICARDO, spaceId: ID.SPACE_VISIONARIO, title: "Domínio prestes a vencer", message: "O domínio de Auto Peças Nova Era vence em 18 dias.", read: false, createdAt: now, type: "vencimento", href: "/visionario/sites" },
    { id: generateId("notif"), userId: ID.USER_RICARDO, spaceId: ID.SPACE_VISIONARIO, title: "Pagamento atrasado", message: "Clínica VitaSorriso está com pagamento atrasado.", read: false, createdAt: now, type: "pagamento", href: `/visionario/clientes/${ID.CLIENT_CLINICA}` },
    { id: generateId("notif"), userId: ID.USER_RICARDO, spaceId: ID.SPACE_VISIONARIO, title: "Trabalho vence amanhã", message: "\"Criar posts do mês\" vence em breve.", read: false, createdAt: now, type: "prazo", href: "/visionario/trabalhos" },
    { id: generateId("notif"), userId: ID.USER_RICARDO, spaceId: ID.SPACE_VISIONARIO, title: "Hospedagem vence em breve", message: "Hospedagem Hostinger de Nova Era Peças vence em 7 dias.", read: false, createdAt: now, type: "vencimento", href: "/visionario/sites" },
    { id: generateId("notif"), userId: ID.USER_RICARDO, spaceId: ID.SPACE_RICARDO_PESSOAL, title: "Atividades pendentes hoje", message: "Você tem atividades pendentes na sua rotina de hoje.", read: true, createdAt: now, type: "sistema", href: "/rotina" },
    { id: generateId("notif"), userId: ID.USER_TESTE, spaceId: ID.SPACE_VISIONARIO, title: "Trabalho atribuído a você", message: "\"Criar posts do mês\" foi atribuído a você.", read: false, createdAt: now, type: "sistema", href: "/visionario/trabalhos" },
  ];

  return {
    profiles,
    spaces,
    spaceMembers,
    activities,
    tasks,
    workTasks,
    financialAccounts,
    transactions,
    recurringExpenses,
    financialGoals,
    clients,
    services,
    clientServices,
    clientPayments,
    clientSites,
    workItems,
    vendors,
    sales,
    commissions,
    expenses,
    notifications,
  };
}
