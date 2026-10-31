-- VSPlanner — tipo de resultado por conjunto de anúncios (histórico/comparação Meta Ads).
--
-- Por quê: uma campanha pode ter conjuntos com objetivos diferentes
-- (ex.: ThruPlay + Mensagens + Engajamento). O custo por mensagem só pode
-- usar o investimento dos conjuntos que geram mensagens; para isso o
-- conjunto precisa ter o seu tipo de resultado. Quando vazio (null), vale o
-- objetivo da campanha (clt_campaigns.objective).
--
-- Aditiva e idempotente: nenhum registro existente é alterado (todos ficam null).
alter table public.clt_ad_sets add column if not exists result_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clt_ad_sets_result_type_check'
      and conrelid = 'public.clt_ad_sets'::regclass
  ) then
    alter table public.clt_ad_sets
      add constraint clt_ad_sets_result_type_check
      check (result_type is null or result_type in ('mensagens','visualizacoes','vendas','engajamento','alcance','trafego','leads','outro'));
  end if;
end $$;

comment on column public.clt_ad_sets.result_type is
  'Tipo de resultado do conjunto (otimização/destino). Null = usa o objetivo da campanha.';
