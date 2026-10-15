-- Diagnóstico de pagamentos: SOMENTE LEITURA.
-- Confira a data real e a conta vinculada a cada pagamento antes de alterar competências.
select o.description as assinatura, o.origin_type as tipo, o.is_active as recorrencia_ativa,
       c.id as cobranca_id, c.due_date as vencimento, c.status as status_cobranca,
       c.original_amount as valor_cobranca,
       p.id as pagamento_id, p.payment_date as data_pagamento,
       p.amount as valor_pago, p.account_id as conta_id
from public.financial_origins o
join public.financial_charges c on c.origin_id=o.id
left join public.financial_payments p on p.charge_id=c.id
where o.description ilike '%chat%gpt%'
   or o.description ilike '%claude%'
   or o.description ilike '%anthropic%'
order by o.description, c.due_date, p.payment_date;