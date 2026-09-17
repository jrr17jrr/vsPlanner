# Configuração do Supabase — Fase 1 (Fundação)

Este guia cobre só a **Fase 1**: Auth, `profiles`, `spaces`, `space_members`, RLS.
Nada dos módulos existentes (Rotina, Trabalho, Financeiro, Visionário, TikTok)
foi conectado ainda — eles continuam rodando normalmente sobre mock/localStorage.

## 1. Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) → **New project**.
2. Escolha organização, nome do projeto (ex: `vsplanner`), senha do banco (guarde-a) e região.
3. Aguarde o projeto ser provisionado (1-2 minutos).

## 2. Rodar a migration da Fase 1

1. No painel do projeto, abra **SQL Editor** (menu lateral).
2. Clique em **New query**.
3. Abra o arquivo `supabase/migrations/001_initial_auth_spaces.sql` deste
   repositório, copie o conteúdo inteiro e cole no editor.
4. Clique em **Run**.
5. Confirme que não houve erro. Você deve ver as tabelas `profiles`, `spaces`
   e `space_members` em **Table Editor**.

## 3. Pegar a URL e a chave anônima

1. No painel do projeto: **Project Settings** (ícone de engrenagem) → **API**.
2. Copie:
   - **Project URL** → vai em `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → vai em `NEXT_PUBLIC_SUPABASE_ANON_KEY`

⚠️ Não copie a **service_role** key para lugar nenhum do front. Ela nunca deve
existir no browser nem em variáveis `NEXT_PUBLIC_*`.

## 4. Configurar localmente

Crie um arquivo `.env.local` na raiz do projeto (esse arquivo **não** é
commitado — já está no `.gitignore`):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key-aqui
```

## 5. Criar seu usuário (Ricardo)

1. No painel do Supabase: **Authentication** → **Users** → **Add user** →
   **Create new user**.
2. Preencha e-mail e senha. Marque **Auto Confirm User** (para não precisar
   configurar e-mail de confirmação nesta fase).
3. Clique em **Create user**.
4. A trigger da migration cria automaticamente: um `profile` (com
   `system_role = 'user'`, `status = 'active'`) e um `space` "Pessoal" com
   você como `owner`. Confira em **Table Editor → profiles** e **→ spaces**.

## 6. Promover sua conta para `super_admin`

Isso é proposital **manual** — nunca automático — para que ninguém vire
super_admin sem alguém com acesso direto ao banco autorizar.

1. Em **Table Editor → profiles** (ou **Authentication → Users**), copie o
   `id` (uuid) do seu usuário recém-criado.
2. Vá em **SQL Editor → New query** e rode, substituindo o UUID:

```sql
-- Promove UM usuário específico para super_admin.
-- Troque '00000000-0000-0000-0000-000000000000' pelo id real do seu profile.
update public.profiles
set system_role = 'super_admin'
where id = '00000000-0000-0000-0000-000000000000';
```

3. Confirme: `select id, name, system_role from public.profiles;` deve
   mostrar seu usuário com `system_role = 'super_admin'`.

Não guarde esse UUID nem esse comando em nenhum arquivo commitado — rode
direto no SQL Editor.

## 7. Criar o usuário de teste

Repita o passo 5 com um segundo e-mail (ex: `teste@seudominio.com`) — ele
fica como `system_role = 'user'` normal (não rode o SQL de promoção para
ele).

## 8. Confirmar `profiles`

```sql
select id, name, system_role, status, created_at from public.profiles order by created_at;
```

Você deve ver as duas contas: a sua como `super_admin`, a de teste como `user`.

## 9. Confirmar `spaces` e `space_members`

```sql
select s.name, s.type, s.owner_id, sm.user_id, sm.role
from public.spaces s
join public.space_members sm on sm.space_id = s.id
order by s.created_at;
```

Cada usuário deve ter um space "Pessoal" próprio, com ele mesmo como `owner`.

## 10. Testar o RLS (opcional, mas recomendado)

No **SQL Editor**, o Supabase roda como `postgres` (bypassa RLS), então para
testar de verdade use a aba **Authentication → Users → (usuário) → "Impersonate"**
se disponível na sua versão do painel, ou teste via o próprio app depois que
a Fase 2 conectar o login real. Cenário esperado (ver seção 27 do pedido
original):

- Usuário A só vê o próprio space Pessoal + spaces business dos quais é membro.
- Usuário A **não** consegue ler o space Pessoal do Usuário B, mesmo sabendo o `id`.
- Usuário comum não consegue se autopromover a `super_admin` (a trigger da
  migration bloqueia isso mesmo que ele edite o próprio profile).

## 11. Configurar as variáveis na Vercel

1. No painel da Vercel → seu projeto → **Settings → Environment Variables**.
2. Adicione, para os ambientes **Production**, **Preview** e **Development**:
   - `NEXT_PUBLIC_SUPABASE_URL` = mesma URL do passo 3
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = mesma anon key do passo 3
3. Redeploy.

## Próximos passos (Fase 2 — ainda não feita)

Depois que você confirmar que rodou a migration com sucesso, a Fase 2 troca
o login mock pelo Supabase Auth real (`signInWithPassword`), liga a
proteção de rotas ao `system_role`/`status` reais e o `SpaceSwitcher` aos
`spaces` reais do banco. Os módulos internos (Rotina, Trabalho, Financeiro,
Visionário, TikTok) continuam em mock/localStorage até fases seguintes.
