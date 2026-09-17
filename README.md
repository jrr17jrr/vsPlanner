# VSPlanner

Central para organizar vida pessoal e negócios (Visionário Dev, TikTok) — primeira versão de front-end funcional, com dados mock e persistência local, pronta para futuramente conectar ao Supabase e publicar na Vercel.

## Instalação

```bash
npm install
```

## Como rodar

```bash
npm run dev      # ambiente de desenvolvimento — http://localhost:3000
npm run build    # build de produção
npm run start    # roda o build de produção
npm run lint     # eslint
```

Na primeira vez que o app abre, redireciona para `/login`. Escolha uma das duas contas de teste:

- **Ricardo** — `super_admin`, dono dos espaços Pessoal, Visionário Dev e TikTok.
- **Usuário Teste** — `user`, dono do próprio espaço Pessoal e membro (não dono) do espaço Visionário Dev. Não tem acesso ao TikTok, ao dinheiro pessoal do Ricardo, nem ao Painel Dev.

## Arquitetura

```
app/                       rotas (App Router)
  (app)/                   grupo autenticado — sidebar + header, redireciona para /login se deslogado
  login/                   login mock
components/
  ui/                      primitivos estilo shadcn (button, dialog, select, tabs, ...)
  shared/                  componentes compostos reutilizáveis (MetricCard, StatusBadge, ResponsiveTable, ...)
  layout/                  sidebar, header, navegação
  forms/                   dialogs de criar/editar para cada entidade
  providers/                HydrationGate (evita mismatch de hidratação com localStorage)
hooks/                     useAuth (sessão + permissões derivadas)
lib/                       formatação, permissões, seletores financeiros, rotina/recorrência, navegação
mock/                      seed relacional (ids fixos + dados realistas) usado na primeira carga
store/                     Zustand + persist — camada de "banco local"
types/                     entidades TypeScript no formato que as tabelas do Supabase usarão
```

### Mocks e persistência

Todos os dados nascem de `mock/seed.ts` (relacional: clientes ⇄ serviços ⇄ pagamentos ⇄ financeiro, vendas ⇄ vendedores ⇄ comissões, trabalhos ⇄ clientes ⇄ rotina). Na primeira execução esse seed é gravado no `localStorage` via `store/db-store.ts` (Zustand + `persist`, chave `vslead:db:v1`); dali em diante toda leitura e escrita (criar, editar, excluir, marcar pago, concluir tarefa, etc.) passa pelas actions desse store e o `localStorage` reflete o estado atual do app.

A sessão (usuário logado) fica em `store/session-store.ts` (`vslead:session:v1`).

Não existem cálculos duplicados: dashboards, gráficos e listagens sempre leem de `lib/selectors.ts`, que centraliza as fórmulas financeiras (saldo, faturamento, MRR, comissões, lucro etc.) a partir das mesmas coleções — então marcar um pagamento como pago, por exemplo, atualiza cards, gráficos e listas ao mesmo tempo.

### Backend real (Supabase) — em andamento, por fases

O front descrito acima continua 100% funcional em mock/localStorage — nada
disso foi desconectado ainda. A migração para um backend real está sendo
feita por fases, para não quebrar o que já funciona:

- **Fase 1 (feita)** — fundação: Supabase Auth, tabelas `profiles`, `spaces`,
  `space_members`, RLS e as funções de segurança que a sustentam. Ver
  `supabase/migrations/001_initial_auth_spaces.sql` e o passo a passo em
  **`SUPABASE_SETUP.md`**. A camada de cliente/repositórios já existe em
  `lib/supabase/` (`client.ts`, `server.ts`, `repositories/`), mas ainda não
  é chamada por nenhuma tela — é código preparado, não conectado.
- **Fase 2 (a fazer)** — substituir o login mock (`store/session-store.ts`)
  pelo Supabase Auth real e ligar a proteção de rotas / `SpaceSwitcher` aos
  dados reais de `profiles`/`spaces`.
- **Fases seguintes** — migrar módulo a módulo (Rotina, Trabalho, Financeiro,
  Visionário Dev, TikTok) de `store/db-store.ts` (mock) para tabelas reais,
  espelhando os tipos já existentes em `types/entities.ts`.

Ao migrar cada módulo, a ideia geral é: RLS no Postgres espelhando
`lib/permissions.ts` (usuário só acessa espaços dos quais é membro,
`system_role`/permissões sempre validados no banco, nunca só na UI, dinheiro
pessoal privado ao dono, dados de negócio restritos aos membros do espaço).

## Stack

Next.js (App Router) · React · TypeScript · Tailwind CSS v4 · componentes estilo shadcn/ui sobre Radix UI · Lucide Icons · Recharts · Zustand — preparado para Supabase (Postgres + Auth) e deploy na Vercel.
