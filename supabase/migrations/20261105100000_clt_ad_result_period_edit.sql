-- =============================================================================
-- VSPlanner — "Editar período" de uma atualização de resultados (CLT e MKT).
--
-- Muda SÓ a atribuição temporal (o período de referência) dos resultados de
-- uma atualização já registrada. A diferença daquela atualização sai do
-- período antigo e entra no novo — nada é somado de novo, o total acumulado
-- do anúncio não muda e o histórico original é preservado. Cada correção fica
-- em clt_ad_result_period_changes (período anterior, novo, data e usuário).
--
-- ADITIVA e idempotente. Depende de 20261104110000_clt_ad_result_updates.sql.
-- =============================================================================

create table if not exists public.clt_ad_result_period_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.clt_companies(id) on delete cascade,
  update_id uuid not null references public.clt_ad_result_updates(id) on delete cascade,
  creative_id uuid not null references public.clt_ad_creatives(id) on delete cascade,
  old_start date not null,
  old_end date not null,
  new_start date not null,
  new_end date not null,
  from_metric_id uuid,
  to_metric_id uuid,
  changed_by_name text,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists clt_ad_result_period_changes_update_idx on public.clt_ad_result_period_changes (update_id, created_at desc);
create index if not exists clt_ad_result_period_changes_company_idx on public.clt_ad_result_period_changes (company_id, created_at desc);
alter table public.clt_ad_result_period_changes enable row level security;
drop policy if exists "owner reads ad result period changes" on public.clt_ad_result_period_changes;
create policy "owner reads ad result period changes" on public.clt_ad_result_period_changes for select to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.clt_companies c where c.id = company_id and c.user_id = auth.uid()));
-- Auditoria: só a função abaixo grava; ninguém altera ou apaga pela API.
revoke insert, update, delete, truncate on public.clt_ad_result_period_changes from authenticated, anon;
grant select on public.clt_ad_result_period_changes to authenticated;

/*
 * Move a diferença de UMA atualização para outro período de referência.
 * SECURITY DEFINER (precisa ajustar o período no histórico, que é imutável
 * pela API), com dono conferido: usuário logado só move as próprias
 * atualizações. Sem JWT (SQL Editor/admin) pode corrigir dados — por isso
 * anon NÃO tem execute.
 */
create or replace function public.clt_move_ad_result_update(
  p_update_id uuid,
  p_start date,
  p_end date,
  p_actor_name text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  u public.clt_ad_result_updates%rowtype;
  src public.clt_ad_period_metrics%rowtype;
  dst public.clt_ad_period_metrics%rowtype;
  d jsonb;
  v_only boolean;
  v_dst uuid;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into u from public.clt_ad_result_updates where id = p_update_id for update;
  if not found or (v_uid is not null and u.user_id <> v_uid) then raise exception 'Atualização não encontrada.'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'Período inválido.'; end if;
  if p_end > v_today then raise exception 'O período dos resultados não pode terminar no futuro.'; end if;
  if p_start = u.period_start and p_end = u.period_end then raise exception 'O novo período é igual ao atual.'; end if;
  if u.period_metric_id is null then raise exception 'O registro de resultados desta atualização não existe mais.'; end if;

  select * into src from public.clt_ad_period_metrics where id = u.period_metric_id and source = 'manual_update' for update;
  if not found then raise exception 'O registro de resultados desta atualização não existe mais.'; end if;
  if src.period_start <> u.period_start or src.period_end <> u.period_end then
    raise exception 'Histórico e resultados estão com períodos diferentes — nada foi alterado.';
  end if;
  if exists (select 1 from public.clt_ad_period_metrics i
             where i.creative_id = u.creative_id and coalesce(i.source, 'import') <> 'manual_update'
               and i.period_start <= p_start and i.period_end >= p_end) then
    raise exception 'O novo período está dentro de um período importado deste anúncio, que prevalece — os valores deixariam de contar.';
  end if;

  d := u.delta;
  -- A linha contém SÓ esta atualização? (valores = diferença desta atualização)
  v_only := coalesce((src.spend)::numeric, 0) = coalesce((d ->> 'spend')::numeric, 0)
    and coalesce(src.conversations, 0) = coalesce((d ->> 'conversations')::int, 0)
    and coalesce(src.sales, 0) = coalesce((d ->> 'sales')::int, 0)
    and coalesce((src.revenue)::numeric, 0) = coalesce((d ->> 'revenue')::numeric, 0)
    and coalesce(src.impressions, 0) = coalesce((d ->> 'impressions')::int, 0)
    and coalesce(src.reach, 0) = coalesce((d ->> 'reach')::int, 0)
    and coalesce(src.link_clicks, 0) = coalesce((d ->> 'link_clicks')::int, 0)
    and coalesce(src.leads, 0) = coalesce((d ->> 'leads')::int, 0)
    and coalesce(src.views, 0) = coalesce((d ->> 'views')::int, 0)
    and coalesce(src.thruplays, 0) = coalesce((d ->> 'thruplays')::int, 0)
    and coalesce(src.engagements, 0) = coalesce((d ->> 'engagements')::int, 0);

  select * into dst from public.clt_ad_period_metrics
   where creative_id = u.creative_id and period_start = p_start and period_end = p_end and source = 'manual_update' for update;

  if v_only and dst.id is null then
    -- Caso simples: a linha é só desta atualização → muda o período dela.
    update public.clt_ad_period_metrics set period_start = p_start, period_end = p_end, updated_at = now() where id = src.id;
    v_dst := src.id;
  else
    if dst.id is null then
      insert into public.clt_ad_period_metrics (user_id, company_id, campaign_id, ad_set_id, creative_id, period_start, period_end,
        spend, conversations, sales, revenue, impressions, reach, link_clicks, leads, views, thruplays, engagements, notes, source)
      values (src.user_id, src.company_id, src.campaign_id, src.ad_set_id, src.creative_id, p_start, p_end,
        (d ->> 'spend')::numeric, (d ->> 'conversations')::int, (d ->> 'sales')::int, (d ->> 'revenue')::numeric,
        (d ->> 'impressions')::int, (d ->> 'reach')::int, (d ->> 'link_clicks')::int, (d ->> 'leads')::int,
        (d ->> 'views')::int, (d ->> 'thruplays')::int, (d ->> 'engagements')::int,
        'Atualização manual dos totais do anúncio (período corrigido).', 'manual_update')
      returning id into v_dst;
    else
      update public.clt_ad_period_metrics set
        spend = case when d ? 'spend' then coalesce(spend, 0) + (d ->> 'spend')::numeric else spend end,
        conversations = case when d ? 'conversations' then coalesce(conversations, 0) + (d ->> 'conversations')::int else conversations end,
        sales = case when d ? 'sales' then coalesce(sales, 0) + (d ->> 'sales')::int else sales end,
        revenue = case when d ? 'revenue' then coalesce(revenue, 0) + (d ->> 'revenue')::numeric else revenue end,
        impressions = case when d ? 'impressions' then coalesce(impressions, 0) + (d ->> 'impressions')::int else impressions end,
        reach = case when d ? 'reach' then coalesce(reach, 0) + (d ->> 'reach')::int else reach end,
        link_clicks = case when d ? 'link_clicks' then coalesce(link_clicks, 0) + (d ->> 'link_clicks')::int else link_clicks end,
        leads = case when d ? 'leads' then coalesce(leads, 0) + (d ->> 'leads')::int else leads end,
        views = case when d ? 'views' then coalesce(views, 0) + (d ->> 'views')::int else views end,
        thruplays = case when d ? 'thruplays' then coalesce(thruplays, 0) + (d ->> 'thruplays')::int else thruplays end,
        engagements = case when d ? 'engagements' then coalesce(engagements, 0) + (d ->> 'engagements')::int else engagements end,
        updated_at = now()
      where id = dst.id;
      v_dst := dst.id;
    end if;
    if v_only then
      -- Todo o conteúdo da linha antiga foi para o novo período.
      delete from public.clt_ad_period_metrics where id = src.id;
    else
      update public.clt_ad_period_metrics set
        spend = case when d ? 'spend' then coalesce(spend, 0) - (d ->> 'spend')::numeric else spend end,
        conversations = case when d ? 'conversations' then coalesce(conversations, 0) - (d ->> 'conversations')::int else conversations end,
        sales = case when d ? 'sales' then coalesce(sales, 0) - (d ->> 'sales')::int else sales end,
        revenue = case when d ? 'revenue' then coalesce(revenue, 0) - (d ->> 'revenue')::numeric else revenue end,
        impressions = case when d ? 'impressions' then coalesce(impressions, 0) - (d ->> 'impressions')::int else impressions end,
        reach = case when d ? 'reach' then coalesce(reach, 0) - (d ->> 'reach')::int else reach end,
        link_clicks = case when d ? 'link_clicks' then coalesce(link_clicks, 0) - (d ->> 'link_clicks')::int else link_clicks end,
        leads = case when d ? 'leads' then coalesce(leads, 0) - (d ->> 'leads')::int else leads end,
        views = case when d ? 'views' then coalesce(views, 0) - (d ->> 'views')::int else views end,
        thruplays = case when d ? 'thruplays' then coalesce(thruplays, 0) - (d ->> 'thruplays')::int else thruplays end,
        engagements = case when d ? 'engagements' then coalesce(engagements, 0) - (d ->> 'engagements')::int else engagements end,
        updated_at = now()
      where id = src.id;
    end if;
  end if;

  -- Nenhum valor negativo (as constraints da tabela também barram) — qualquer erro desfaz tudo.
  if exists (select 1 from public.clt_ad_period_metrics where id in (src.id, v_dst)
             and (coalesce(spend, 0) < 0 or coalesce(conversations, 0) < 0 or coalesce(sales, 0) < 0 or coalesce(revenue, 0) < 0
               or coalesce(impressions, 0) < 0 or coalesce(reach, 0) < 0 or coalesce(link_clicks, 0) < 0 or coalesce(leads, 0) < 0
               or coalesce(views, 0) < 0 or coalesce(thruplays, 0) < 0 or coalesce(engagements, 0) < 0)) then
    raise exception 'A mudança deixaria valores negativos — nada foi alterado.';
  end if;

  update public.clt_ad_result_updates set period_start = p_start, period_end = p_end, period_metric_id = v_dst where id = u.id;
  insert into public.clt_ad_result_period_changes (user_id, company_id, update_id, creative_id, old_start, old_end, new_start, new_end,
    from_metric_id, to_metric_id, changed_by_name, reason)
  values (u.user_id, u.company_id, u.id, u.creative_id, u.period_start, u.period_end, p_start, p_end, src.id, v_dst,
    nullif(btrim(coalesce(p_actor_name, '')), ''), nullif(btrim(coalesce(p_reason, '')), ''));

  return jsonb_build_object('metric_id', v_dst, 'merged', dst.id is not null);
end;
$$;

revoke all on function public.clt_move_ad_result_update(uuid, date, date, text, text) from public, anon;
grant execute on function public.clt_move_ad_result_update(uuid, date, date, text, text) to authenticated;
