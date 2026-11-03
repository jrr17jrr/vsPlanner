-- =============================================================================
-- VSPlanner — CORREÇÃO PONTUAL (não é migration): IG Predial, atualização de
-- 03/11/2026 cujos resultados pertencem a OUTUBRO de 2026.
--
-- Campanha: "IG Predial | WhatsApp | Cabo Frio | 15/10/2026"
-- Atualização registrada em 03/11/2026: 37 → 66 vendas (+29) e
-- R$ 9.360,00 → R$ 16.860,00 (+R$ 7.500,00), gravada no período
-- 30/10/2026 a 03/11/2026. Novo período: outubro de 2026 (01/10 a 31/10).
--
-- Usa a MESMA função do botão "Editar período" (clt_move_ad_result_update):
-- só muda a atribuição temporal; investimento (R$ 206,22), conversas (21) e
-- outros anúncios não são tocados; o total acumulado não muda.
--
-- PRÉ-REQUISITO: migrations 20261104110000 e 20261105100000 aplicadas.
-- COMO USAR (SQL Editor do Supabase de produção):
--   1. Rode o PASSO 1 (somente leitura) e confira que aparece UMA linha.
--   2. Rode o PASSO 2. Ele ABORTA sem alterar nada se não achar exatamente
--      uma atualização ou se qualquer conferência falhar.
--   3. Rode o PASSO 3 (somente leitura) para conferir o resultado.
-- =============================================================================

-- PASSO 1 — localizar (somente leitura) -------------------------------------
select u.id as update_id, co.name as empresa, c.name as campanha, a.name as anuncio,
       u.period_start, u.period_end, u.mode, u.previous, u.updated, u.delta,
       (u.created_at at time zone 'America/Sao_Paulo') as registrado_em_sp, u.period_metric_id
  from public.clt_ad_result_updates u
  join public.clt_campaigns c on c.id = u.campaign_id
  join public.clt_companies co on co.id = u.company_id
  join public.clt_ad_creatives a on a.id = u.creative_id
 where c.name = 'IG Predial | WhatsApp | Cabo Frio | 15/10/2026'
 order by u.created_at;

-- PASSO 2 — corrigir (transação única; aborta em qualquer divergência) -------
do $$
declare
  v_ids uuid[];
  v_id uuid;
  v_creative uuid;
  v_before record;
  v_after record;
  v_oct record;
  v_nov record;
begin
  select array_agg(u.id) into v_ids
    from public.clt_ad_result_updates u
    join public.clt_campaigns c on c.id = u.campaign_id
   where c.name = 'IG Predial | WhatsApp | Cabo Frio | 15/10/2026'
     and u.period_start = date '2026-10-30' and u.period_end = date '2026-11-03'
     and (u.delta ->> 'sales')::numeric = 29
     and (u.delta ->> 'revenue')::numeric = 7500
     and not (u.delta ? 'spend') and not (u.delta ? 'conversations')
     and (u.updated ->> 'sales')::numeric = 66 and (u.updated ->> 'revenue')::numeric = 16860
     and (u.created_at at time zone 'America/Sao_Paulo')::date = date '2026-11-03';

  if coalesce(array_length(v_ids, 1), 0) <> 1 then
    raise exception 'Esperava exatamente 1 atualização, encontrei %. Nada foi alterado — confira o PASSO 1.', coalesce(array_length(v_ids, 1), 0);
  end if;
  v_id := v_ids[1];
  select creative_id into v_creative from public.clt_ad_result_updates where id = v_id;

  -- Totais acumulados do anúncio ANTES (todas as linhas por período do anúncio).
  select coalesce(sum(spend), 0) as spend, coalesce(sum(conversations), 0) as conv, coalesce(sum(sales), 0) as sales, coalesce(sum(revenue), 0) as revenue
    into v_before from public.clt_ad_period_metrics where creative_id = v_creative;

  perform public.clt_move_ad_result_update(v_id, date '2026-10-01', date '2026-10-31', 'Correção pontual (SQL)', 'Resultados pertencem a outubro/2026');

  select coalesce(sum(spend), 0) as spend, coalesce(sum(conversations), 0) as conv, coalesce(sum(sales), 0) as sales, coalesce(sum(revenue), 0) as revenue
    into v_after from public.clt_ad_period_metrics where creative_id = v_creative;
  if v_after is distinct from v_before then
    raise exception 'Totais mudaram (antes %, depois %) — revertido.', v_before, v_after;
  end if;

  -- Atribuição por mês (regra dos relatórios: mês do fim do período).
  select coalesce(sum(sales), 0) as sales, coalesce(sum(revenue), 0) as revenue into v_oct
    from public.clt_ad_period_metrics where creative_id = v_creative and source = 'manual_update' and to_char(period_end, 'YYYY-MM') = '2026-10';
  select coalesce(sum(sales), 0) as sales, coalesce(sum(revenue), 0) as revenue into v_nov
    from public.clt_ad_period_metrics where creative_id = v_creative and source = 'manual_update' and to_char(period_end, 'YYYY-MM') = '2026-11';
  if v_oct.sales < 29 or v_oct.revenue < 7500 then
    raise exception 'Outubro não recebeu os valores (%). Revertido.', v_oct;
  end if;
  raise notice 'OK: atualização % movida para 01/10–31/10/2026. Totais do anúncio: %. Manual em outubro: %. Manual em novembro: %.', v_id, v_after, v_oct, v_nov;
end $$;

-- PASSO 3 — conferir (somente leitura) ---------------------------------------
-- Linhas por período do anúncio corrigido (import 30/09–29/10 + manual 01/10–31/10):
select m.period_start, m.period_end, m.source, m.spend, m.conversations, m.sales, m.revenue
  from public.clt_ad_period_metrics m
  join public.clt_campaigns c on c.id = m.campaign_id
 where c.name = 'IG Predial | WhatsApp | Cabo Frio | 15/10/2026'
 order by m.period_start, m.source;
-- Auditoria da correção:
select ch.old_start, ch.old_end, ch.new_start, ch.new_end, ch.changed_by_name, ch.reason, ch.created_at
  from public.clt_ad_result_period_changes ch
  join public.clt_ad_result_updates u on u.id = ch.update_id
  join public.clt_campaigns c on c.id = u.campaign_id
 where c.name = 'IG Predial | WhatsApp | Cabo Frio | 15/10/2026';
