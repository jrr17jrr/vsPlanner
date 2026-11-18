-- =============================================================================
-- VSPlanner — Links das publicações dos anúncios + novas métricas de vídeo e
-- engajamento (CLT e MKT).
-- Migration: 20261117110000_clt_ad_post_links_video_metrics.sql
--
-- ADITIVA e idempotente: não apaga nem altera nenhum dado existente.
-- Depende de 20261108100000_clt_ad_hook_hold_rates.sql e
-- 20261109100000_clt_registered_info.sql.
--
--   1. clt_ad_creatives ganha 4 colunas OPCIONAIS (texto, NULL = não informado):
--        instagram_url    link da publicação no Instagram
--        reels_url        link do Reels
--        facebook_url     link da publicação no Facebook
--        destination_url  URL de DESTINO do anúncio (site/landing/WhatsApp)
--      "Destino do anúncio" (destination, texto livre) e "Link do anúncio ou da
--      publicação" (asset_url) continuam como estavam.
--   2. clt_ad_period_metrics ganha 5 colunas OPCIONAIS (NULL = não informado):
--        saves                         publicações salvas          (contagem)
--        video_p25, video_p50, video_p95  reproduções de 25/50/95%  (contagem)
--        avg_watch_time                tempo médio de reprodução (segundos),
--                                      INFORMADO — nunca somado (como as taxas)
--      Reproduções de 3s/75%/100%, ThruPlays e visualizações já existiam.
--   3. clt_apply_ad_result_update e clt_move_ad_result_update recriadas com as
--      novas colunas (mesmas assinaturas e permissões).
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar este
-- arquivo inteiro → Run. Seguro para reexecutar.
-- =============================================================================

-- 1. Links das publicações ------------------------------------------------------
alter table public.clt_ad_creatives add column if not exists instagram_url text;
alter table public.clt_ad_creatives add column if not exists reels_url text;
alter table public.clt_ad_creatives add column if not exists facebook_url text;
alter table public.clt_ad_creatives add column if not exists destination_url text;
comment on column public.clt_ad_creatives.instagram_url is 'Link da publicação do Instagram usada no anúncio.';
comment on column public.clt_ad_creatives.reels_url is 'Link do Reels usado no anúncio.';
comment on column public.clt_ad_creatives.facebook_url is 'Link da publicação do Facebook usada no anúncio.';
comment on column public.clt_ad_creatives.destination_url is 'URL de destino do anúncio (não é o link da publicação).';

-- 2. Novas métricas por anúncio/período ----------------------------------------
alter table public.clt_ad_period_metrics add column if not exists saves integer;
alter table public.clt_ad_period_metrics add column if not exists video_p25 integer;
alter table public.clt_ad_period_metrics add column if not exists video_p50 integer;
alter table public.clt_ad_period_metrics add column if not exists video_p95 integer;
alter table public.clt_ad_period_metrics add column if not exists avg_watch_time numeric(8,2);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clt_ad_period_metrics_video_v2_nonneg' and conrelid = 'public.clt_ad_period_metrics'::regclass) then
    alter table public.clt_ad_period_metrics add constraint clt_ad_period_metrics_video_v2_nonneg check (
      (saves is null or saves >= 0) and (video_p25 is null or video_p25 >= 0) and (video_p50 is null or video_p50 >= 0)
      and (video_p95 is null or video_p95 >= 0) and (avg_watch_time is null or avg_watch_time >= 0));
  end if;
end $$;
comment on column public.clt_ad_period_metrics.saves is 'Publicações salvas (Meta Ads).';
comment on column public.clt_ad_period_metrics.avg_watch_time is 'Tempo médio de reprodução do vídeo, em segundos, informado (Meta Ads). Não é somado.';

-- "Atualizar resultados" -------------------------------------------------------
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
  v_num constant text[] := array['spend','conversations','sales','revenue','impressions','reach','link_clicks','leads','views','thruplays','engagements',
    'reactions','comments','shares','new_followers','video_plays_3s','video_p75','video_p100','hook_rate','hold_rate',
    'saves','video_p25','video_p50','video_p95','avg_watch_time'];
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
  foreach k in array array['hook_rate','hold_rate'] loop
    if p_values ? k and jsonb_typeof(p_values -> k) <> 'null' and (p_values ->> k)::numeric > 100 then
      raise exception 'Percentual acima de 100 em %.', k;
    end if;
  end loop;

  if p_metric_id is not null then
    update clt_ad_period_metrics set
      spend = (p_values ->> 'spend')::numeric, conversations = (p_values ->> 'conversations')::int, sales = (p_values ->> 'sales')::int,
      revenue = (p_values ->> 'revenue')::numeric, impressions = (p_values ->> 'impressions')::int, reach = (p_values ->> 'reach')::int,
      link_clicks = (p_values ->> 'link_clicks')::int, leads = (p_values ->> 'leads')::int, views = (p_values ->> 'views')::int,
      thruplays = (p_values ->> 'thruplays')::int, engagements = (p_values ->> 'engagements')::int,
      reactions = (p_values ->> 'reactions')::int, comments = (p_values ->> 'comments')::int, shares = (p_values ->> 'shares')::int,
      new_followers = (p_values ->> 'new_followers')::int, video_plays_3s = (p_values ->> 'video_plays_3s')::int,
      video_p75 = (p_values ->> 'video_p75')::int, video_p100 = (p_values ->> 'video_p100')::int,
      hook_rate = (p_values ->> 'hook_rate')::numeric, hold_rate = (p_values ->> 'hold_rate')::numeric,
      saves = (p_values ->> 'saves')::int, video_p25 = (p_values ->> 'video_p25')::int, video_p50 = (p_values ->> 'video_p50')::int,
      video_p95 = (p_values ->> 'video_p95')::int, avg_watch_time = (p_values ->> 'avg_watch_time')::numeric,
      updated_at = now()
    where id = p_metric_id and creative_id = p_creative_id and user_id = v_uid and source = 'manual_update'
    returning id into v_metric;
    if v_metric is null then raise exception 'Atualização anterior não encontrada (recarregue a página).'; end if;
  else
    insert into clt_ad_period_metrics (user_id, company_id, campaign_id, ad_set_id, creative_id, period_start, period_end,
      spend, conversations, sales, revenue, impressions, reach, link_clicks, leads, views, thruplays, engagements,
      reactions, comments, shares, new_followers, video_plays_3s, video_p75, video_p100, hook_rate, hold_rate,
      saves, video_p25, video_p50, video_p95, avg_watch_time, notes, source)
    values (v_uid, v_company, v_campaign, v_set, p_creative_id, p_period_start, p_period_end,
      (p_values ->> 'spend')::numeric, (p_values ->> 'conversations')::int, (p_values ->> 'sales')::int, (p_values ->> 'revenue')::numeric,
      (p_values ->> 'impressions')::int, (p_values ->> 'reach')::int, (p_values ->> 'link_clicks')::int, (p_values ->> 'leads')::int,
      (p_values ->> 'views')::int, (p_values ->> 'thruplays')::int, (p_values ->> 'engagements')::int,
      (p_values ->> 'reactions')::int, (p_values ->> 'comments')::int, (p_values ->> 'shares')::int, (p_values ->> 'new_followers')::int,
      (p_values ->> 'video_plays_3s')::int, (p_values ->> 'video_p75')::int, (p_values ->> 'video_p100')::int,
      (p_values ->> 'hook_rate')::numeric, (p_values ->> 'hold_rate')::numeric,
      (p_values ->> 'saves')::int, (p_values ->> 'video_p25')::int, (p_values ->> 'video_p50')::int, (p_values ->> 'video_p95')::int, (p_values ->> 'avg_watch_time')::numeric,
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

-- "Editar período" -------------------------------------------------------------
-- Contagens: movidas pela diferença (como antes). Taxas: o valor vai junto
-- para o novo período (substitui), nunca é somado nem subtraído.
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
  -- A linha contém SÓ esta atualização? (contagens = diferença desta atualização; taxas = valor desta atualização ou vazias)
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
    and coalesce(src.engagements, 0) = coalesce((d ->> 'engagements')::int, 0)
    and coalesce(src.reactions, 0) = coalesce((d ->> 'reactions')::int, 0)
    and coalesce(src.comments, 0) = coalesce((d ->> 'comments')::int, 0)
    and coalesce(src.shares, 0) = coalesce((d ->> 'shares')::int, 0)
    and coalesce(src.new_followers, 0) = coalesce((d ->> 'new_followers')::int, 0)
    and coalesce(src.video_plays_3s, 0) = coalesce((d ->> 'video_plays_3s')::int, 0)
    and coalesce(src.video_p75, 0) = coalesce((d ->> 'video_p75')::int, 0)
    and coalesce(src.video_p100, 0) = coalesce((d ->> 'video_p100')::int, 0)
    and (src.hook_rate is null or src.hook_rate = (d ->> 'hook_rate')::numeric)
    and coalesce(src.saves, 0) = coalesce((d ->> 'saves')::int, 0)
    and coalesce(src.video_p25, 0) = coalesce((d ->> 'video_p25')::int, 0)
    and coalesce(src.video_p50, 0) = coalesce((d ->> 'video_p50')::int, 0)
    and coalesce(src.video_p95, 0) = coalesce((d ->> 'video_p95')::int, 0)
    and (src.hold_rate is null or src.hold_rate = (d ->> 'hold_rate')::numeric)
    and (src.avg_watch_time is null or src.avg_watch_time = (d ->> 'avg_watch_time')::numeric);

  select * into dst from public.clt_ad_period_metrics
   where creative_id = u.creative_id and period_start = p_start and period_end = p_end and source = 'manual_update' for update;

  if v_only and dst.id is null then
    update public.clt_ad_period_metrics set period_start = p_start, period_end = p_end, updated_at = now() where id = src.id;
    v_dst := src.id;
  else
    if dst.id is null then
      insert into public.clt_ad_period_metrics (user_id, company_id, campaign_id, ad_set_id, creative_id, period_start, period_end,
        spend, conversations, sales, revenue, impressions, reach, link_clicks, leads, views, thruplays, engagements,
        reactions, comments, shares, new_followers, video_plays_3s, video_p75, video_p100, hook_rate, hold_rate,
      saves, video_p25, video_p50, video_p95, avg_watch_time, notes, source)
      values (src.user_id, src.company_id, src.campaign_id, src.ad_set_id, src.creative_id, p_start, p_end,
        (d ->> 'spend')::numeric, (d ->> 'conversations')::int, (d ->> 'sales')::int, (d ->> 'revenue')::numeric,
        (d ->> 'impressions')::int, (d ->> 'reach')::int, (d ->> 'link_clicks')::int, (d ->> 'leads')::int,
        (d ->> 'views')::int, (d ->> 'thruplays')::int, (d ->> 'engagements')::int,
        (d ->> 'reactions')::int, (d ->> 'comments')::int, (d ->> 'shares')::int, (d ->> 'new_followers')::int,
        (d ->> 'video_plays_3s')::int, (d ->> 'video_p75')::int, (d ->> 'video_p100')::int,
        (d ->> 'hook_rate')::numeric, (d ->> 'hold_rate')::numeric,
        (d ->> 'saves')::int, (d ->> 'video_p25')::int, (d ->> 'video_p50')::int, (d ->> 'video_p95')::int, (d ->> 'avg_watch_time')::numeric,
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
        reactions = case when d ? 'reactions' then coalesce(reactions, 0) + (d ->> 'reactions')::int else reactions end,
        comments = case when d ? 'comments' then coalesce(comments, 0) + (d ->> 'comments')::int else comments end,
        shares = case when d ? 'shares' then coalesce(shares, 0) + (d ->> 'shares')::int else shares end,
        new_followers = case when d ? 'new_followers' then coalesce(new_followers, 0) + (d ->> 'new_followers')::int else new_followers end,
        video_plays_3s = case when d ? 'video_plays_3s' then coalesce(video_plays_3s, 0) + (d ->> 'video_plays_3s')::int else video_plays_3s end,
        video_p75 = case when d ? 'video_p75' then coalesce(video_p75, 0) + (d ->> 'video_p75')::int else video_p75 end,
        video_p100 = case when d ? 'video_p100' then coalesce(video_p100, 0) + (d ->> 'video_p100')::int else video_p100 end,
        -- Taxas: substituídas (nunca somadas).
        hook_rate = case when d ? 'hook_rate' then (d ->> 'hook_rate')::numeric else hook_rate end,
        hold_rate = case when d ? 'hold_rate' then (d ->> 'hold_rate')::numeric else hold_rate end,
        saves = case when d ? 'saves' then coalesce(saves, 0) + (d ->> 'saves')::int else saves end,
        video_p25 = case when d ? 'video_p25' then coalesce(video_p25, 0) + (d ->> 'video_p25')::int else video_p25 end,
        video_p50 = case when d ? 'video_p50' then coalesce(video_p50, 0) + (d ->> 'video_p50')::int else video_p50 end,
        video_p95 = case when d ? 'video_p95' then coalesce(video_p95, 0) + (d ->> 'video_p95')::int else video_p95 end,
        avg_watch_time = case when d ? 'avg_watch_time' then (d ->> 'avg_watch_time')::numeric else avg_watch_time end,
        updated_at = now()
      where id = dst.id;
      v_dst := dst.id;
    end if;
    if v_only then
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
        reactions = case when d ? 'reactions' then coalesce(reactions, 0) - (d ->> 'reactions')::int else reactions end,
        comments = case when d ? 'comments' then coalesce(comments, 0) - (d ->> 'comments')::int else comments end,
        shares = case when d ? 'shares' then coalesce(shares, 0) - (d ->> 'shares')::int else shares end,
        new_followers = case when d ? 'new_followers' then coalesce(new_followers, 0) - (d ->> 'new_followers')::int else new_followers end,
        video_plays_3s = case when d ? 'video_plays_3s' then coalesce(video_plays_3s, 0) - (d ->> 'video_plays_3s')::int else video_plays_3s end,
        video_p75 = case when d ? 'video_p75' then coalesce(video_p75, 0) - (d ->> 'video_p75')::int else video_p75 end,
        video_p100 = case when d ? 'video_p100' then coalesce(video_p100, 0) - (d ->> 'video_p100')::int else video_p100 end,
        -- A taxa desta atualização sai do registro antigo (vai junto para o novo período).
        hook_rate = case when d ? 'hook_rate' and hook_rate = (d ->> 'hook_rate')::numeric then null else hook_rate end,
        hold_rate = case when d ? 'hold_rate' and hold_rate = (d ->> 'hold_rate')::numeric then null else hold_rate end,
        saves = case when d ? 'saves' then coalesce(saves, 0) - (d ->> 'saves')::int else saves end,
        video_p25 = case when d ? 'video_p25' then coalesce(video_p25, 0) - (d ->> 'video_p25')::int else video_p25 end,
        video_p50 = case when d ? 'video_p50' then coalesce(video_p50, 0) - (d ->> 'video_p50')::int else video_p50 end,
        video_p95 = case when d ? 'video_p95' then coalesce(video_p95, 0) - (d ->> 'video_p95')::int else video_p95 end,
        avg_watch_time = case when d ? 'avg_watch_time' and avg_watch_time = (d ->> 'avg_watch_time')::numeric then null else avg_watch_time end,
        updated_at = now()
      where id = src.id;
    end if;
  end if;

  -- Nenhum valor negativo (as constraints da tabela também barram) — qualquer erro desfaz tudo.
  if exists (select 1 from public.clt_ad_period_metrics where id in (src.id, v_dst)
             and (coalesce(spend, 0) < 0 or coalesce(conversations, 0) < 0 or coalesce(sales, 0) < 0 or coalesce(revenue, 0) < 0
               or coalesce(impressions, 0) < 0 or coalesce(reach, 0) < 0 or coalesce(link_clicks, 0) < 0 or coalesce(leads, 0) < 0
               or coalesce(views, 0) < 0 or coalesce(thruplays, 0) < 0 or coalesce(engagements, 0) < 0
               or coalesce(reactions, 0) < 0 or coalesce(comments, 0) < 0 or coalesce(shares, 0) < 0 or coalesce(new_followers, 0) < 0
               or coalesce(video_plays_3s, 0) < 0 or coalesce(video_p75, 0) < 0 or coalesce(video_p100, 0) < 0
               or coalesce(saves, 0) < 0 or coalesce(video_p25, 0) < 0 or coalesce(video_p50, 0) < 0 or coalesce(video_p95, 0) < 0)) then
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
