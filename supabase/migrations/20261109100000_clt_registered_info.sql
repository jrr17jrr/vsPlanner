-- =============================================================================
-- VSPlanner — Informações cadastradas de campanhas, conjuntos e anúncios.
-- Migration ADITIVA e idempotente:
--   * só adiciona colunas opcionais (NULL = "Não informado");
--   * NÃO altera, move nem apaga nenhum dado existente;
--   * reaproveita as colunas que já existem (meta_*_id, objective, budgets,
--     manager_url, description, location, placements, asset_url, post_id,
--     notes) — nada é duplicado.
--   * `details`: outras configurações informadas na importação (chave → valor).
-- =============================================================================

-- ------------------------------------------------------------- campanhas
alter table public.clt_campaigns add column if not exists bid_strategy text;
alter table public.clt_campaigns add column if not exists buying_type text;
alter table public.clt_campaigns add column if not exists details jsonb not null default '{}'::jsonb;
comment on column public.clt_campaigns.bid_strategy is 'Estratégia de lances informada (ex.: Volume mais alto).';
comment on column public.clt_campaigns.buying_type is 'Tipo de compra informado (ex.: Leilão).';
comment on column public.clt_campaigns.details is 'Outras configurações informadas (chave → valor).';

-- ------------------------------------------------------------- conjuntos
alter table public.clt_ad_sets add column if not exists radius_km numeric(8,2);
alter table public.clt_ad_sets add column if not exists age_min smallint;
alter table public.clt_ad_sets add column if not exists age_max smallint;
alter table public.clt_ad_sets add column if not exists gender text;
alter table public.clt_ad_sets add column if not exists languages text;
alter table public.clt_ad_sets add column if not exists conversion_location text;
alter table public.clt_ad_sets add column if not exists performance_goal text;
alter table public.clt_ad_sets add column if not exists details jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clt_ad_sets_info_ranges') then
    alter table public.clt_ad_sets add constraint clt_ad_sets_info_ranges check (
      (radius_km is null or radius_km >= 0)
      and (age_min is null or age_min between 13 and 100)
      and (age_max is null or age_max between 13 and 100)
      and (age_min is null or age_max is null or age_max >= age_min)
    );
  end if;
end $$;
comment on column public.clt_ad_sets.conversion_location is 'Local da conversão (ex.: WhatsApp, Site, Formulário).';
comment on column public.clt_ad_sets.performance_goal is 'Objetivo de desempenho do conjunto (ex.: Maximizar conversas).';
comment on column public.clt_ad_sets.details is 'Outras configurações informadas (chave → valor).';

-- ------------------------------------------------------------- anúncios
-- O link do anúncio/publicação reaproveita a coluna existente asset_url.
alter table public.clt_ad_creatives add column if not exists primary_text text;
alter table public.clt_ad_creatives add column if not exists headline text;
alter table public.clt_ad_creatives add column if not exists description text;
alter table public.clt_ad_creatives add column if not exists call_to_action text;
alter table public.clt_ad_creatives add column if not exists destination text;
alter table public.clt_ad_creatives add column if not exists details jsonb not null default '{}'::jsonb;
comment on column public.clt_ad_creatives.asset_url is 'Link do anúncio ou da publicação.';
comment on column public.clt_ad_creatives.call_to_action is 'Botão de chamada para ação (ex.: Enviar mensagem).';
comment on column public.clt_ad_creatives.destination is 'Destino do anúncio (ex.: WhatsApp).';
comment on column public.clt_ad_creatives.details is 'Outras informações informadas (chave → valor).';
