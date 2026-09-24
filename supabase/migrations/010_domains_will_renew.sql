-- =============================================================================
-- VSPlanner — Domínios: renovação planejada.
-- Migration: 010_domains_will_renew.sql
--
-- Adiciona `domains.will_renew` — a DECISÃO de renovar ou não no próximo
-- vencimento, separada do `status` (um domínio pode estar 'ativo' hoje e já
-- estar marcado para não ser renovado). Não altera nenhum status existente.
--
-- Todos os domínios atuais começam com will_renew = true (default aplicado
-- às linhas existentes pelo próprio ADD COLUMN ... DEFAULT).
--
-- RLS: nenhuma policy nova — as policies de `domains` (migration 009, módulo
-- 'sites') já valem para a tabela inteira, inclusive esta coluna.
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar este
-- arquivo inteiro → Run. Seguro para reexecutar. Requer a migration 009.
-- =============================================================================

alter table public.domains
  add column if not exists will_renew boolean not null default true;

comment on column public.domains.will_renew is
  'true = pretendo renovar no próximo vencimento; false = deixar expirar. '
  'Independente de status (o domínio continua ativo até expirar/cancelar). '
  'Só domínios ativos com will_renew = true contam como renovação prevista.';

-- Soma/lista de "renovações previstas" filtra por status + will_renew.
create index if not exists idx_domains_space_will_renew
  on public.domains (space_id, status, will_renew);

-- =============================================================================
-- Fim da migration 010.
-- =============================================================================
