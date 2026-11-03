-- =============================================================================
-- VSPlanner — "Atualizar resultados" de um anúncio (CLT e MKT).
--
-- Os resultados continuam numa ÚNICA fonte por anúncio: clt_ad_period_metrics
-- (a mesma da importação, que já alimenta anúncio → conjunto → campanha →
-- empresa → relatórios). Atualizar = informar os NOVOS TOTAIS acumulados; o
-- servidor grava só a DIFERENÇA para o total atual, como um período
-- [dia seguinte ao último dado → hoje] com source = 'manual_update'. Nada é
-- somado em dobro, nada é rateado entre dias e os períodos anteriores ficam
-- como estavam.
--
-- ADITIVA e idempotente: não apaga nem altera dados existentes.
--   1. clt_ad_period_metrics ganha views, thruplays e engagements (NULL = não
--      informado — a importação continua sem esses campos);
--   2. clt_ad_result_updates: histórico de cada atualização (antes, depois,
--      diferença, período, usuário). Imutável pela API (só leitura/inserção);
--   3. clt_apply_ad_result_update(): grava a linha de resultado e o histórico
--      numa ÚNICA transação (SECURITY INVOKER: valem RLS e o dono da empresa).
-- =============================================================================

alter table public.clt_ad_period_metrics add column if not exists views integer;
alter table public.clt_ad_period_metrics add column if not exists thruplays integer;
alter table public.clt_ad_period_metrics add column if not exists engagements integer;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clt_ad_period_metrics_extra_nonneg' and conrelid = 'public.clt_ad_period_metrics'::regclass) then
    alter table public.clt_ad_period_metrics add constraint clt_ad_period_metrics_extra_nonneg
      check ((views is null or views >= 0) and (thruplays is null or thruplays >= 0) and (engagements is null or engagements >= 0));
  end if;
end $$;

create table if not exists public.clt_ad_result_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.clt_companies(id) on delete cascade,
  campaign_id uuid not null references public.clt_campaigns(id) on delete cascade,
  ad_set_id uuid not null references public.clt_ad_sets(id) on delete cascade,
  creative_id uuid not null references public.clt_ad_creatives(id) on delete cascade,
  period_metric_id uuid references public.clt_ad_period_metrics(id) on delete set null,
  period_start date not null,
  period_end date not null,
  mode text not null check (mode in ('novo_periodo', 'ajuste')),
  previous jsonb not null default '{}'::jsonb,
  updated jsonb not null default '{}'::jsonb,
  delta jsonb not null default '{}'::jsonb,
  updated_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists clt_ad_result_updates_creative_idx on public.clt_ad_result_updates (creative_id, created_at desc);
create index if not exists clt_ad_result_updates_company_idx on public.clt_ad_result_updates (company_id, created_at desc);
alter table public.clt_ad_result_updates enable row level security;

drop policy if exists "owner reads ad result updates" on public.clt_ad_result_updates;
create policy "owner reads ad result updates" on public.clt_ad_result_updates for select to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.clt_companies c where c.id = company_id and c.user_id = auth.uid()));
drop policy if exists "owner inserts ad result updates" on public.clt_ad_result_updates;
create policy "owner inserts ad result updates" on public.clt_ad_result_updates for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.clt_companies c where c.id = company_id and c.user_id = auth.uid()));
-- Histórico imutável: as permissões padrão do schema dariam UPDATE/DELETE; só leitura e inserção.
revoke update, delete, truncate on public.clt_ad_result_updates from authenticated, anon;
grant select, insert on public.clt_ad_result_updates to authenticated;

create or replace function public.clt_apply_ad_result_update(
  p_creative_id uuid,
  p_metric_id uuid,
  p_period_start date,
  p_period_end date,
  p_values jsonb,
  p_previous jsonb,
  p_updated jsonb,
  p_delta jsonb,
  p_updated_by_name text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_set uuid; v_campaign uuid; v_company uuid; v_metric uuid;
  v_num constant text[] := array['spend','conversations','sales','revenue','impressions','reach','link_clicks','leads','views','thruplays','engagements'];
  k text;
begin
  if v_uid is null then raise exception 'Sessão inválida.' using errcode = '28000'; end if;
  select a.ad_set_id, s.campaign_id, c.company_id into v_set, v_campaign, v_company
    from clt_ad_creatives a join clt_ad_sets s on s.id = a.ad_set_id join clt_campaigns c on c.id = s.campaign_id
    join clt_companies co on co.id = c.company_id
   where a.id = p_creative_id and a.user_id = v_uid and co.user_id = v_uid;
  if v_set is null then raise exception 'Anúncio não encontrado.'; end if;
  if p_period_end < p_period_start then raise exception 'Período inválido.'; end if;
  foreach k in array v_num loop
    if p_values ? k and jsonb_typeof(p_values -> k) <> 'null' and (p_values ->> k)::numeric < 0 then
      raise exception 'Valor negativo em %.', k;
    end if;
  end loop;

  if p_metric_id is not null then
    -- Ajuste da atualização manual mais recente (mesmo dia ou correção para baixo).
    update clt_ad_period_metrics set
      spend = (p_values ->> 'spend')::numeric, conversations = (p_values ->> 'conversations')::int, sales = (p_values ->> 'sales')::int,
      revenue = (p_values ->> 'revenue')::numeric, impressions = (p_values ->> 'impressions')::int, reach = (p_values ->> 'reach')::int,
      link_clicks = (p_values ->> 'link_clicks')::int, leads = (p_values ->> 'leads')::int, views = (p_values ->> 'views')::int,
      thruplays = (p_values ->> 'thruplays')::int, engagements = (p_values ->> 'engagements')::int, updated_at = now()
    where id = p_metric_id and creative_id = p_creative_id and user_id = v_uid and source = 'manual_update'
    returning id into v_metric;
    if v_metric is null then raise exception 'Atualização anterior não encontrada (recarregue a página).'; end if;
  else
    insert into clt_ad_period_metrics (user_id, company_id, campaign_id, ad_set_id, creative_id, period_start, period_end,
      spend, conversations, sales, revenue, impressions, reach, link_clicks, leads, views, thruplays, engagements, notes, source)
    values (v_uid, v_company, v_campaign, v_set, p_creative_id, p_period_start, p_period_end,
      (p_values ->> 'spend')::numeric, (p_values ->> 'conversations')::int, (p_values ->> 'sales')::int, (p_values ->> 'revenue')::numeric,
      (p_values ->> 'impressions')::int, (p_values ->> 'reach')::int, (p_values ->> 'link_clicks')::int, (p_values ->> 'leads')::int,
      (p_values ->> 'views')::int, (p_values ->> 'thruplays')::int, (p_values ->> 'engagements')::int,
      'Atualização manual dos totais do anúncio (diferença para o total anterior).', 'manual_update')
    returning id into v_metric;
  end if;

  insert into clt_ad_result_updates (user_id, company_id, campaign_id, ad_set_id, creative_id, period_metric_id, period_start, period_end,
    mode, previous, updated, delta, updated_by_name)
  values (v_uid, v_company, v_campaign, v_set, p_creative_id, v_metric, p_period_start, p_period_end,
    case when p_metric_id is null then 'novo_periodo' else 'ajuste' end, coalesce(p_previous, '{}'), coalesce(p_updated, '{}'), coalesce(p_delta, '{}'), nullif(btrim(p_updated_by_name), ''));

  return jsonb_build_object('metric_id', v_metric, 'company_id', v_company);
end;
$$;

revoke all on function public.clt_apply_ad_result_update(uuid, uuid, date, date, jsonb, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.clt_apply_ad_result_update(uuid, uuid, date, date, jsonb, jsonb, jsonb, jsonb, text) to authenticated;
