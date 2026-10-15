-- Diagnóstico seguro: somente leitura. Não altera pagamentos ou recorrências.
select
  o.id as origem_id,
  o.description as assinatura,
  o.origin_type as tipo,
  o.is_active as recorrencia_ativa,
  o.recurrence_frequency as frequencia,
  c.id as cobranca_id,
  c.due_date as vencimento,
  c.status as status_cobranca,
  c.original_amount as valor_cobranca,
  coalesce((select sum(p.amount) from public.financial_payments p where p.charge_id=c.id),0) as total_pago
from public.financial_origins o
left join public.financial_charges c on c.origin_id=o.id
where o.description ilike '%chat%gpt%'
   or o.description ilike '%claude%'
   or o.description ilike '%anthropic%'
order by o.description, c.due_date;