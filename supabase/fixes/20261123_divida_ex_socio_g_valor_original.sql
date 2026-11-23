-- =============================================================================
-- VSPlanner — Correção da dívida "Dívida — Ex-sócio G" (Visionário Dev).
-- Fix: 20261123_divida_ex_socio_g_valor_original.sql
--
-- CAUSA: o pagamento de R$ 353,00 foi registrado com "Quitar a dívida com
-- este pagamento" LIGADO (era o padrão do diálogo). O banco transformou os
-- R$ 475,00 que faltavam em DESCONTO (financial_charges.discount_amount) e
-- o valor da cobrança (amount = original − desconto + acréscimo) caiu para
-- R$ 525,00 → a tela mostrava Total 525 / Restante 0 / 100%.
--
-- O QUE ESTE SCRIPT FAZ (somente nessa dívida):
--   * valor original = R$ 1.000,00, desconto = 0, acréscimo = 0;
--   * os pagamentos (R$ 172 e R$ 353) NÃO são alterados — só deixam de
--     carregar o desconto que tinham aplicado (settle_discount/settle_addition
--     = 0), para que "desfazer" nunca tente devolver um desconto inexistente.
--   Nenhuma outra cobrança, conta, cartão, parcela, receita ou despesa é tocada.
--
-- ALTERNATIVA SEM SQL: no app (Visionário Dev → Financeiro → Visão geral →
-- Dívidas) clique em "Restaurar valor original" no card da dívida.
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar → Run.
-- Seguro para reexecutar (na 2ª vez não muda nada).
-- =============================================================================

begin;

update public.financial_payments p
   set settle_discount = 0, settle_addition = 0
  from public.financial_charges c
 where p.charge_id = c.id
   and c.kind = 'saida'
   and trim(c.description) = 'Dívida — Ex-sócio G'
   and (p.settle_discount <> 0 or p.settle_addition <> 0);

update public.financial_charges c
   set original_amount = 1000, discount_amount = 0, addition_amount = 0
 where c.kind = 'saida'
   and trim(c.description) = 'Dívida — Ex-sócio G'
   and c.status <> 'cancelado'
   -- trava: nunca deixa o total abaixo do que já foi pago
   and (select coalesce(sum(p.amount), 0) from public.financial_payments p where p.charge_id = c.id) <= 1000;

commit;

-- Conferência (esperado: total 1000.00 · pago 525.00 · restante 475.00 · 52.5%)
select c.description,
       c.original_amount as total,
       c.discount_amount as desconto,
       c.amount as valor_cobranca,
       coalesce(sum(p.amount), 0) as pago,
       c.original_amount - coalesce(sum(p.amount), 0) as restante,
       round(coalesce(sum(p.amount), 0) / nullif(c.original_amount, 0) * 100, 1) as progresso_pct,
       count(p.id) as pagamentos
  from public.financial_charges c
  left join public.financial_payments p on p.charge_id = c.id
 where c.kind = 'saida' and trim(c.description) = 'Dívida — Ex-sócio G'
 group by c.id;
