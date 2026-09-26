-- =============================================================================
-- VSPlanner — Data de início das recorrências.
-- Migration: 012_recurrence_start_date.sql
--
-- Bug corrigido: a recorrência não tinha data de início salva — o início era
-- só "a 1ª cobrança". Recorrências mensais eram gravadas com
-- recurrence_interval = 2 (padrão do formulário) e a edição enviava null;
-- qualquer edição (valor, nome, categoria) era tratada como "troca de
-- frequência": cancelava a 1ª competência (ex.: 25/10) e recriava a série a
-- partir de HOJE (ex.: 25/09) — uma ocorrência ANTES do início, que entrava
-- em "A pagar" e "Próximos pagamentos".
--
--   1. financial_origins.recurrence_start_date — 1º vencimento válido.
--      Nenhuma ocorrência pode vencer antes dele (regra central no código:
--      isOnOrAfterRecurrenceStart).
--   2. Backfill: vencimento da 1ª cobrança CRIADA de cada recorrência (a da
--      criação) — nunca a de menor data, que pode ser a gerada pelo bug.
--   3. recurrence_interval = null onde a frequência não usa intervalo.
--   4. Reparo: ocorrências SEM PAGAMENTO que vencem antes do início são
--      canceladas (status 'cancelado', nada é apagado) e, nessas mesmas
--      recorrências, as competências a partir do início que o bug cancelou
--      voltam a ficar ativas. Cobranças com pagamento NUNCA são alteradas.
--
-- Para conferir ANTES de rodar o que será reparado, rode só este SELECT:
--
--   select o.description, c.due_date, c.amount, c.status, c.created_at
--   from financial_charges c
--   join financial_origins o on o.id = c.origin_id
--   where o.origin_type = 'recorrente'
--   order by o.description, c.created_at;
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar este
-- arquivo inteiro → Run. Seguro para reexecutar. Requer a migration 011.
-- =============================================================================

alter table public.financial_origins
  add column if not exists recurrence_start_date date;

comment on column public.financial_origins.recurrence_start_date is
  'Primeiro vencimento da recorrência. Nenhuma ocorrência pode vencer antes desta data.';

-- -----------------------------------------------------------------------------
-- 2. Backfill do início: 1ª cobrança criada da série.
-- -----------------------------------------------------------------------------
update public.financial_origins o
set recurrence_start_date = first_created.due_date
from (
  select distinct on (origin_id) origin_id, due_date
  from public.financial_charges
  order by origin_id, created_at asc, due_date asc
) first_created
where o.origin_type = 'recorrente'
  and o.recurrence_start_date is null
  and first_created.origin_id = o.id;

-- -----------------------------------------------------------------------------
-- 3. Intervalo só existe em "a cada N meses".
-- -----------------------------------------------------------------------------
update public.financial_origins
set recurrence_interval = null
where origin_type = 'recorrente'
  and recurrence_frequency not in ('a_cada_x_meses', 'customizado')
  and recurrence_interval is not null;

-- -----------------------------------------------------------------------------
-- 4. Reparo das ocorrências geradas antes do início (sem pagamento).
-- -----------------------------------------------------------------------------
do $$
declare
  affected uuid[];
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- Recorrências que têm ocorrência ativa, sem pagamento, antes do início.
  select coalesce(array_agg(distinct c.origin_id), '{}')
  into affected
  from public.financial_charges c
  join public.financial_origins o on o.id = c.origin_id
  where o.origin_type = 'recorrente'
    and o.recurrence_start_date is not null
    and c.status = 'ativo'
    and c.due_date < o.recurrence_start_date
    and not exists (select 1 from public.financial_payments p where p.charge_id = c.id);

  if array_length(affected, 1) is null then
    raise notice 'Nenhuma ocorrência antes do início encontrada — nada a reparar.';
    return;
  end if;

  update public.financial_charges c
  set status = 'cancelado'
  from public.financial_origins o
  where o.id = c.origin_id
    and c.origin_id = any (affected)
    and c.status = 'ativo'
    and c.due_date < o.recurrence_start_date
    and not exists (select 1 from public.financial_payments p where p.charge_id = c.id);

  -- Devolve as competências válidas (>= início, >= hoje) que o bug cancelou,
  -- uma por competência, só em recorrências ativas e sem outra ativa no mês.
  update public.financial_charges c
  set status = 'ativo'
  from (
    select distinct on (c2.origin_id, c2.competency_date) c2.id
    from public.financial_charges c2
    join public.financial_origins o on o.id = c2.origin_id
    where c2.origin_id = any (affected)
      and o.is_active
      and c2.status = 'cancelado'
      and c2.installment_number is null
      and c2.due_date >= o.recurrence_start_date
      and c2.due_date >= today
      and not exists (select 1 from public.financial_payments p where p.charge_id = c2.id)
      and not exists (
        select 1 from public.financial_charges a
        where a.origin_id = c2.origin_id
          and a.status = 'ativo'
          and a.competency_date = c2.competency_date
      )
    order by c2.origin_id, c2.competency_date, c2.created_at asc
  ) restore
  where c.id = restore.id;

  raise notice 'Reparadas % recorrência(s).', array_length(affected, 1);
end;
$$;

-- =============================================================================
-- Fim da migration 012.
-- =============================================================================
