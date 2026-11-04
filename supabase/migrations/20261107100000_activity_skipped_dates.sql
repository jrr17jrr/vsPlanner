-- =============================================================================
-- Minha Rotina — "Excluir somente neste dia" (ocorrência de atividade recorrente)
--
-- Acrescenta UMA coluna em `activities`: a lista de dias em que aquela
-- atividade recorrente NÃO acontece mais. A atividade, os outros dias e o
-- histórico (activity_completions) continuam intactos.
--
-- Segurança dos dados:
--   * só ADICIONA uma coluna com default '{}' — nenhuma linha existente muda
--     de comportamento (lista vazia = todos os dias continuam valendo);
--   * nenhum dado é apagado ou reescrito;
--   * a RLS de `activities` (user_id = auth.uid()) já vale para a coluna nova;
--   * idempotente: pode ser executada mais de uma vez.
--
-- Sem esta migration o app continua funcionando: "Excluir somente neste dia"
-- fica desativado com aviso e "Excluir atividade inteira" funciona.
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar este
-- arquivo inteiro → Run.
-- =============================================================================

alter table public.activities
  add column if not exists skipped_dates date[] not null default '{}';

comment on column public.activities.skipped_dates is
  'Dias (yyyy-mm-dd) em que a atividade recorrente foi excluída só naquele dia '
  '("Excluir somente neste dia" na Minha Rotina). Não apaga a atividade nem o '
  'histórico; os demais dias continuam valendo.';
