-- =============================================================================
-- VSPlanner — Recorrências (contas a pagar/receber fixas) como "assinatura".
-- Migration: 011_recurring_payables.sql
--
-- NÃO cria arquitetura paralela: a RECORRÊNCIA continua sendo
-- `financial_origins` (origin_type = 'recorrente') e cada OCORRÊNCIA/
-- competência continua sendo uma linha em `financial_charges` (com seus
-- `financial_payments`). Ocorrências futuras seguem sendo geradas sob
-- demanda (nunca "infinitas" no banco).
--
-- O que muda (tudo aditivo, sem apagar/alterar histórico):
--
--   1. financial_origins.recurrence_day — dia fixo de vencimento (1..31).
--      Antes o "dia" era deduzido da 1ª cobrança: uma recorrência "todo dia
--      31" iniciada em fevereiro nascia em 28/02 e ficava presa no dia 28.
--      Com o dia salvo, meses curtos usam o último dia válido e os demais
--      voltam ao dia certo. Também permite EDITAR o dia.
--   2. financial_origins.recurrence_amount — valor ATUAL da recorrência.
--      Antes a próxima competência copiava a última cobrança; se a última já
--      estava paga com o valor antigo, reajustar não tinha efeito. Agora
--      "Internet 120 → 130" vale para as próximas competências sem tocar em
--      nenhum pagamento já registrado.
--   3. financial_origins.notes — observações da recorrência.
--   4. Índice único parcial: no máximo UMA ocorrência ATIVA por competência
--      em cada recorrência (além do índice origem+vencimento da 009).
--      Recorrências semanais passam a usar a própria data como competência
--      (várias por mês é esperado nelas).
--
-- Backfill seguro para recorrências existentes (dia e valor atuais a partir
-- das cobranças já geradas / do contrato). Nenhum pagamento é alterado.
-- RLS: sem mudanças — as policies de financial_origins/financial_charges
-- (migration 007, has_module_permission 'financeiro') cobrem as colunas novas.
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar este
-- arquivo inteiro → Run. Seguro para reexecutar. Requer a migration 009.
-- =============================================================================

alter table public.financial_origins
  add column if not exists recurrence_day smallint,
  add column if not exists recurrence_amount numeric(12, 2),
  add column if not exists notes text;

alter table public.financial_origins
  drop constraint if exists financial_origins_recurrence_day_range;
alter table public.financial_origins
  add constraint financial_origins_recurrence_day_range
  check (recurrence_day is null or recurrence_day between 1 and 31);

alter table public.financial_origins
  drop constraint if exists financial_origins_recurrence_amount_positive;
alter table public.financial_origins
  add constraint financial_origins_recurrence_amount_positive
  check (recurrence_amount is null or recurrence_amount >= 0);

comment on column public.financial_origins.recurrence_day is
  'Dia fixo de vencimento da recorrência (1..31). Mês sem esse dia usa o último dia válido.';
comment on column public.financial_origins.recurrence_amount is
  'Valor ATUAL de cada nova competência. Reajustar muda só competências futuras em aberto.';

-- -----------------------------------------------------------------------------
-- Backfill das recorrências já existentes
-- -----------------------------------------------------------------------------

-- Dia: do contrato (client_services.due_day) quando houver; senão, o dia da
-- 1ª cobrança gerada.
update public.financial_origins o
set recurrence_day = cs.due_day
from public.client_services cs
where o.origin_type = 'recorrente'
  and o.recurrence_day is null
  and o.client_service_id = cs.id
  and cs.due_day is not null;

update public.financial_origins o
set recurrence_day = extract(day from first_charge.due_date)::smallint
from (
  select distinct on (origin_id) origin_id, due_date
  from public.financial_charges
  order by origin_id, due_date asc
) first_charge
where o.origin_type = 'recorrente'
  and o.recurrence_day is null
  and o.recurrence_frequency is distinct from 'semanal'
  and first_charge.origin_id = o.id;

-- Valor atual: o da cobrança não cancelada mais recente.
update public.financial_origins o
set recurrence_amount = last_charge.original_amount
from (
  select distinct on (origin_id) origin_id, original_amount
  from public.financial_charges
  where status = 'ativo'
  order by origin_id, due_date desc
) last_charge
where o.origin_type = 'recorrente'
  and o.recurrence_amount is null
  and last_charge.origin_id = o.id;

-- Semanais: competência = a própria data (várias por mês).
update public.financial_charges c
set competency_date = c.due_date
from public.financial_origins o
where c.origin_id = o.id
  and o.origin_type = 'recorrente'
  and o.recurrence_frequency = 'semanal'
  and c.competency_date is distinct from c.due_date;

-- Cobranças recorrentes sem competência recebem o mês do vencimento.
update public.financial_charges c
set competency_date = date_trunc('month', c.due_date)::date
from public.financial_origins o
where c.origin_id = o.id
  and o.origin_type = 'recorrente'
  and c.competency_date is null;

-- -----------------------------------------------------------------------------
-- No máximo UMA ocorrência ativa por competência, por recorrência.
-- Parcelas (installment_number) ficam de fora: podem compartilhar
-- competência por escolha do usuário. Só cria se não houver duplicatas.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from public.financial_charges
    where status = 'ativo' and installment_number is null and competency_date is not null
    group by origin_id, competency_date
    having count(*) > 1
  ) then
    raise notice 'Existem ocorrências ativas duplicadas na mesma competência. Índice uq_financial_charges_origin_competency NÃO criado — revise e reexecute.';
  else
    create unique index if not exists uq_financial_charges_origin_competency
      on public.financial_charges (origin_id, competency_date)
      where status = 'ativo' and installment_number is null and competency_date is not null;
  end if;
end;
$$;

-- =============================================================================
-- Fim da migration 011.
-- =============================================================================
