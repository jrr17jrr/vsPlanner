-- Optional ad creative identification and original ad text.
-- Existing records remain unchanged. Run this migration before deploying the UI.
alter table public.clt_ad_creatives add column if not exists creative_label text;
alter table public.clt_ad_creatives add column if not exists ad_copy text;

create or replace function public.clt_import_bundle(p_company_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_period_start date := nullif(p_payload #>> '{period,start}', '')::date;
  v_period_end date := nullif(p_payload #>> '{period,end}', '')::date;
  v_refs jsonb := '{}'::jsonb;
  v_aud jsonb; v_cmp jsonb; v_set jsonb; v_ad jsonb; v_m jsonb; v_rec jsonb;
  v_id uuid; v_src uuid; v_cmp_id uuid; v_set_id uuid; v_ad_id uuid; v_aud_id uuid;
  v_run_id uuid := gen_random_uuid();
  v_starts date; v_ends date;
  n jsonb := jsonb_build_object(
    'audiences_created', 0, 'audiences_updated', 0, 'campaigns_created', 0, 'campaigns_updated', 0,
    'ad_sets_created', 0, 'ad_sets_updated', 0, 'ads_created', 0, 'ads_updated', 0, 'metrics_saved', 0, 'reconciliations_saved', 0);
begin
  if v_uid is null then
    raise exception 'Sessão inválida.' using errcode = '28000';
  end if;
  if not exists (select 1 from clt_companies where id = p_company_id and user_id = v_uid) then
    raise exception 'Empresa não encontrada.';
  end if;
  if (v_period_start is null) <> (v_period_end is null) or v_period_end < v_period_start then
    raise exception 'Período das métricas inválido.';
  end if;

  -- Públicos: semelhantes por último, para a origem já existir.
  for v_aud in
    select value from jsonb_array_elements(coalesce(p_payload -> 'audiences', '[]'::jsonb))
    order by (value ->> 'audience_type') = 'semelhante'
  loop
    v_src := null;
    if v_aud ->> 'audience_type' = 'semelhante' then
      v_src := coalesce(nullif(v_aud ->> 'source_existing_id', '')::uuid, nullif(v_refs ->> (v_aud ->> 'source_ref'), '')::uuid);
      if v_src is null or not exists (select 1 from clt_audiences where id = v_src and company_id = p_company_id and user_id = v_uid) then
        raise exception 'Público de origem não encontrado para "%".', v_aud ->> 'name';
      end if;
    end if;
    v_id := null;
    if nullif(v_aud ->> 'existing_id', '') is not null then
      update clt_audiences set
        name = v_aud ->> 'name',
        external_key = coalesce(external_key, nullif(v_aud ->> 'external_key', '')),
        settings = coalesce(settings, '{}'::jsonb) || coalesce(v_aud -> 'settings', '{}'::jsonb),
        source_audience_id = coalesce(v_src, source_audience_id),
        updated_at = now()
      where id = (v_aud ->> 'existing_id')::uuid and company_id = p_company_id and user_id = v_uid
        and audience_type = v_aud ->> 'audience_type'
      returning id into v_id;
      if v_id is null then raise exception 'Público "%" não pôde ser atualizado (tipo ou empresa divergente).', v_aud ->> 'name'; end if;
      n := jsonb_set(n, '{audiences_updated}', to_jsonb((n ->> 'audiences_updated')::int + 1));
    else
      insert into clt_audiences (user_id, company_id, name, audience_type, settings, source_audience_id, external_key)
      values (v_uid, p_company_id, v_aud ->> 'name', v_aud ->> 'audience_type', coalesce(v_aud -> 'settings', '{}'::jsonb), v_src, nullif(v_aud ->> 'external_key', ''))
      returning id into v_id;
      n := jsonb_set(n, '{audiences_created}', to_jsonb((n ->> 'audiences_created')::int + 1));
    end if;
    v_refs := v_refs || jsonb_build_object(v_aud ->> 'ref', v_id);
  end loop;

  for v_cmp in select value from jsonb_array_elements(coalesce(p_payload -> 'campaigns', '[]'::jsonb)) loop
    v_cmp_id := null;
    if nullif(v_cmp ->> 'existing_id', '') is not null then
      select coalesce(nullif(v_cmp ->> 'starts_on', '')::date, starts_on), coalesce(nullif(v_cmp ->> 'ends_on', '')::date, ends_on)
        into v_starts, v_ends from clt_campaigns where id = (v_cmp ->> 'existing_id')::uuid and company_id = p_company_id and user_id = v_uid;
      update clt_campaigns set
        name = v_cmp ->> 'name',
        meta_campaign_id = coalesce(meta_campaign_id, nullif(v_cmp ->> 'meta_campaign_id', '')),
        objective = coalesce(nullif(v_cmp ->> 'objective', ''), objective),
        daily_budget = coalesce(nullif(v_cmp ->> 'daily_budget', '')::numeric, daily_budget),
        starts_on = v_starts,
        ends_on = greatest(v_ends, v_starts),
        campaign_status = case when (v_cmp ->> 'status_explicit')::boolean then v_cmp ->> 'campaign_status' else campaign_status end,
        created_in_meta = created_in_meta or nullif(v_cmp ->> 'meta_campaign_id', '') is not null
      where id = (v_cmp ->> 'existing_id')::uuid and company_id = p_company_id and user_id = v_uid
      returning id into v_cmp_id;
      if v_cmp_id is null then raise exception 'Campanha "%" não encontrada nesta empresa.', v_cmp ->> 'name'; end if;
      n := jsonb_set(n, '{campaigns_updated}', to_jsonb((n ->> 'campaigns_updated')::int + 1));
    else
      insert into clt_campaigns (user_id, company_id, name, objective, description, starts_on, ends_on, budget_type, daily_budget,
        planned_amount, campaign_status, spent_amount, messages, sales, views, meta_campaign_id, created_in_meta)
      values (v_uid, p_company_id, v_cmp ->> 'name', nullif(v_cmp ->> 'objective', ''), nullif(v_cmp ->> 'notes', ''),
        (v_cmp ->> 'starts_on')::date, (v_cmp ->> 'ends_on')::date, v_cmp ->> 'budget_type', nullif(v_cmp ->> 'daily_budget', '')::numeric,
        0, v_cmp ->> 'campaign_status', 0, 0, 0, 0, nullif(v_cmp ->> 'meta_campaign_id', ''), nullif(v_cmp ->> 'meta_campaign_id', '') is not null)
      returning id into v_cmp_id;
      n := jsonb_set(n, '{campaigns_created}', to_jsonb((n ->> 'campaigns_created')::int + 1));
    end if;

    v_rec := v_cmp -> 'reconciliation';
    if v_rec is not null and jsonb_typeof(v_rec) = 'object' and v_period_start is not null then
      insert into clt_campaign_reconciliations (user_id, company_id, campaign_id, period_start, period_end, reported_spend,
        reported_conversations, reported_impressions, unallocated_spend, unallocated_conversations, notes)
      values (v_uid, p_company_id, v_cmp_id, v_period_start, v_period_end, nullif(v_rec ->> 'reported_spend', '')::numeric,
        nullif(v_rec ->> 'reported_conversations', '')::int, nullif(v_rec ->> 'reported_impressions', '')::int,
        nullif(v_rec ->> 'unallocated_spend', '')::numeric, nullif(v_rec ->> 'unallocated_conversations', '')::int, nullif(v_cmp ->> 'notes', ''))
      on conflict (campaign_id, period_start, period_end) do update set
        reported_spend = coalesce(excluded.reported_spend, clt_campaign_reconciliations.reported_spend),
        reported_conversations = coalesce(excluded.reported_conversations, clt_campaign_reconciliations.reported_conversations),
        reported_impressions = coalesce(excluded.reported_impressions, clt_campaign_reconciliations.reported_impressions),
        unallocated_spend = coalesce(excluded.unallocated_spend, clt_campaign_reconciliations.unallocated_spend),
        unallocated_conversations = coalesce(excluded.unallocated_conversations, clt_campaign_reconciliations.unallocated_conversations),
        notes = coalesce(excluded.notes, clt_campaign_reconciliations.notes),
        updated_at = now();
      n := jsonb_set(n, '{reconciliations_saved}', to_jsonb((n ->> 'reconciliations_saved')::int + 1));
    end if;

    for v_set in select value from jsonb_array_elements(coalesce(v_cmp -> 'ad_sets', '[]'::jsonb)) loop
      v_aud_id := coalesce(nullif(v_set ->> 'audience_existing_id', '')::uuid, nullif(v_refs ->> (v_set ->> 'audience_ref'), '')::uuid);
      if nullif(v_set ->> 'audience_ref', '') is not null and v_aud_id is null then
        raise exception 'Público do conjunto "%" não resolvido.', v_set ->> 'name';
      end if;
      if v_aud_id is not null and not exists (select 1 from clt_audiences where id = v_aud_id and company_id = p_company_id and user_id = v_uid) then
        raise exception 'O público do conjunto "%" é de outra empresa.', v_set ->> 'name';
      end if;
      v_set_id := null;
      if nullif(v_set ->> 'existing_id', '') is not null then
        update clt_ad_sets set
          name = v_set ->> 'name',
          meta_adset_id = coalesce(meta_adset_id, nullif(v_set ->> 'meta_adset_id', '')),
          saved_audience_id = coalesce(v_aud_id, saved_audience_id),
          daily_budget = coalesce(nullif(v_set ->> 'daily_budget', '')::numeric, daily_budget),
          starts_at_local = coalesce(nullif(v_set ->> 'starts_at', '')::timestamp, starts_at_local),
          ends_at_local = coalesce(nullif(v_set ->> 'ends_at', '')::timestamp, ends_at_local),
          reported_status = coalesce(nullif(v_set ->> 'status', ''), reported_status),
          placements = coalesce(nullif(v_set ->> 'placements', ''), placements),
          notes = coalesce(nullif(v_set ->> 'notes', ''), notes)
        where id = (v_set ->> 'existing_id')::uuid and campaign_id = v_cmp_id and user_id = v_uid
        returning id into v_set_id;
        if v_set_id is null then raise exception 'Conjunto "%" não pertence à campanha.', v_set ->> 'name'; end if;
        n := jsonb_set(n, '{ad_sets_updated}', to_jsonb((n ->> 'ad_sets_updated')::int + 1));
      else
        insert into clt_ad_sets (user_id, campaign_id, name, saved_audience_id, budget_amount, daily_budget, meta_adset_id,
          starts_at_local, ends_at_local, reported_status, placements, notes)
        values (v_uid, v_cmp_id, v_set ->> 'name', v_aud_id, coalesce(nullif(v_set ->> 'daily_budget', '')::numeric, 0),
          nullif(v_set ->> 'daily_budget', '')::numeric, nullif(v_set ->> 'meta_adset_id', ''), nullif(v_set ->> 'starts_at', '')::timestamp,
          nullif(v_set ->> 'ends_at', '')::timestamp, nullif(v_set ->> 'status', ''), nullif(v_set ->> 'placements', ''), nullif(v_set ->> 'notes', ''))
        returning id into v_set_id;
        n := jsonb_set(n, '{ad_sets_created}', to_jsonb((n ->> 'ad_sets_created')::int + 1));
      end if;

      for v_ad in select value from jsonb_array_elements(coalesce(v_set -> 'ads', '[]'::jsonb)) loop
        v_ad_id := null;
        if nullif(v_ad ->> 'existing_id', '') is not null then
          update clt_ad_creatives set
            name = v_ad ->> 'name',
            meta_ad_id = coalesce(meta_ad_id, nullif(v_ad ->> 'meta_ad_id', '')),
            post_id = coalesce(nullif(v_ad ->> 'post_id', ''), post_id),
            notes = coalesce(nullif(v_ad ->> 'notes', ''), notes),
            creative_label = coalesce(nullif(v_ad ->> 'creative_label', ''), creative_label),
            ad_copy = coalesce(nullif(v_ad ->> 'ad_copy', ''), ad_copy)
          where id = (v_ad ->> 'existing_id')::uuid and ad_set_id = v_set_id and user_id = v_uid
          returning id into v_ad_id;
          if v_ad_id is null then raise exception 'Anúncio "%" não pertence ao conjunto.', v_ad ->> 'name'; end if;
          n := jsonb_set(n, '{ads_updated}', to_jsonb((n ->> 'ads_updated')::int + 1));
        else
          insert into clt_ad_creatives (user_id, ad_set_id, name, format, notes, meta_ad_id, post_id, creative_label, ad_copy)
          values (v_uid, v_set_id, v_ad ->> 'name', coalesce(nullif(v_ad ->> 'format', ''), 'outro'), nullif(v_ad ->> 'notes', ''),
            nullif(v_ad ->> 'meta_ad_id', ''), nullif(v_ad ->> 'post_id', ''),
            nullif(v_ad ->> 'creative_label', ''), nullif(v_ad ->> 'ad_copy', ''))
          returning id into v_ad_id;
          n := jsonb_set(n, '{ads_created}', to_jsonb((n ->> 'ads_created')::int + 1));
        end if;

        v_m := v_ad -> 'metrics';
        if v_m is not null and jsonb_typeof(v_m) = 'object' then
          if v_period_start is null then raise exception 'Período das métricas não informado.'; end if;
          insert into clt_ad_period_metrics (user_id, company_id, campaign_id, ad_set_id, creative_id, period_start, period_end,
            spend, conversations, sales, revenue, impressions, reach, link_clicks, leads, notes, source, import_run_id)
          values (v_uid, p_company_id, v_cmp_id, v_set_id, v_ad_id, v_period_start, v_period_end,
            nullif(v_m ->> 'spend', '')::numeric, nullif(v_m ->> 'conversations', '')::int, nullif(v_m ->> 'sales', '')::int,
            nullif(v_m ->> 'revenue', '')::numeric, nullif(v_m ->> 'impressions', '')::int, nullif(v_m ->> 'reach', '')::int,
            nullif(v_m ->> 'linkClicks', '')::int, nullif(v_m ->> 'leads', '')::int, nullif(v_ad ->> 'notes', ''),
            coalesce(p_payload ->> 'source_format', 'import'), v_run_id)
          on conflict (creative_id, period_start, period_end) do update set
            -- Valor ausente na reimportação NÃO apaga o valor já salvo.
            spend = coalesce(excluded.spend, clt_ad_period_metrics.spend),
            conversations = coalesce(excluded.conversations, clt_ad_period_metrics.conversations),
            sales = coalesce(excluded.sales, clt_ad_period_metrics.sales),
            revenue = coalesce(excluded.revenue, clt_ad_period_metrics.revenue),
            impressions = coalesce(excluded.impressions, clt_ad_period_metrics.impressions),
            reach = coalesce(excluded.reach, clt_ad_period_metrics.reach),
            link_clicks = coalesce(excluded.link_clicks, clt_ad_period_metrics.link_clicks),
            leads = coalesce(excluded.leads, clt_ad_period_metrics.leads),
            notes = coalesce(excluded.notes, clt_ad_period_metrics.notes),
            import_run_id = excluded.import_run_id,
            updated_at = now();
          n := jsonb_set(n, '{metrics_saved}', to_jsonb((n ->> 'metrics_saved')::int + 1));
        end if;
      end loop;
    end loop;
  end loop;

  insert into clt_import_runs (id, user_id, company_id, source_format, period_start, period_end, summary)
  values (v_run_id, v_uid, p_company_id, coalesce(p_payload ->> 'source_format', 'import'), v_period_start, v_period_end, n);

  return n || jsonb_build_object('import_run_id', v_run_id);
end;
$$;
