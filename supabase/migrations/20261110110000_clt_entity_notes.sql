-- =============================================================================
-- VSPlanner — Histórico de anotações em campanhas, conjuntos e anúncios (CLT/MKT).
-- Migration: 20261110110000_clt_entity_notes.sql
--
-- ADITIVA e idempotente: só cria a tabela nova `clt_entity_notes`.
-- Não altera nem apaga nenhuma coluna/linha existente (o campo `notes`
-- antigo de cada registro continua como está).
--
-- Histórico de verdade: cada anotação é uma linha nova com data e hora.
-- Não existe policy de UPDATE nem de DELETE — pela API ninguém edita ou
-- apaga uma anotação anterior. (Elas só somem se a própria campanha/
-- conjunto/anúncio for excluída, junto com o resto do histórico dela.)
--
-- Isolamento CLT/MKT: a anotação herda o módulo da empresa pela campanha.
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar → Run.
-- =============================================================================

create table if not exists public.clt_entity_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  level text not null check (level in ('campaign', 'ad_set', 'ad')),
  campaign_id uuid not null references public.clt_campaigns (id) on delete cascade,
  ad_set_id uuid references public.clt_ad_sets (id) on delete cascade,
  creative_id uuid references public.clt_ad_creatives (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  author_name text,
  created_at timestamptz not null default now(),
  constraint clt_entity_notes_level_target check (
    (level = 'campaign' and ad_set_id is null and creative_id is null)
    or (level = 'ad_set' and ad_set_id is not null and creative_id is null)
    or (level = 'ad' and ad_set_id is not null and creative_id is not null)
  )
);

comment on table public.clt_entity_notes is
  'Anotações com data/hora de campanhas, conjuntos e anúncios. Somente inclusão: anotações anteriores nunca são substituídas nem apagadas.';

create index if not exists idx_clt_entity_notes_campaign on public.clt_entity_notes (campaign_id, created_at desc);
create index if not exists idx_clt_entity_notes_ad_set on public.clt_entity_notes (ad_set_id, created_at desc) where ad_set_id is not null;
create index if not exists idx_clt_entity_notes_creative on public.clt_entity_notes (creative_id, created_at desc) where creative_id is not null;

-- O alvo precisa ser coerente (conjunto da campanha, anúncio do conjunto) e do mesmo usuário.
create or replace function public.clt_entity_notes_check_target()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.clt_campaigns where id = new.campaign_id and user_id = new.user_id) then
    raise exception 'Campanha não encontrada.';
  end if;
  if new.ad_set_id is not null and not exists (
    select 1 from public.clt_ad_sets where id = new.ad_set_id and campaign_id = new.campaign_id and user_id = new.user_id
  ) then
    raise exception 'Conjunto não pertence a esta campanha.';
  end if;
  if new.creative_id is not null and not exists (
    select 1 from public.clt_ad_creatives where id = new.creative_id and ad_set_id = new.ad_set_id and user_id = new.user_id
  ) then
    raise exception 'Anúncio não pertence a este conjunto.';
  end if;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists clt_entity_notes_check_target on public.clt_entity_notes;
create trigger clt_entity_notes_check_target
  before insert on public.clt_entity_notes
  for each row execute function public.clt_entity_notes_check_target();

alter table public.clt_entity_notes enable row level security;

drop policy if exists "Own entity notes select" on public.clt_entity_notes;
create policy "Own entity notes select" on public.clt_entity_notes for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Own entity notes insert" on public.clt_entity_notes;
create policy "Own entity notes insert" on public.clt_entity_notes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.clt_campaigns c where c.id = campaign_id and c.user_id = auth.uid()));

-- Sem UPDATE/DELETE pela API: histórico imutável.
revoke update, delete on public.clt_entity_notes from authenticated, anon;
grant select, insert on public.clt_entity_notes to authenticated;
