-- Diagnóstico de visibilidade do Claude no financeiro: somente leitura.
-- Mostra o espaço da assinatura, cobrança e pagamento e o motivo provável da ausência.
select
 o.description as conta,
 o.origin_type as tipo,
 o.space_id as espaco_assinatura,
 c.space_id as espaco_cobranca,
 c.id as cobranca_id,
 c.due_date as vencimento,
 c.status as status_cobranca,
 c.kind as tipo_movimento,
 c.amount as valor_cobranca,
 p.space_id as espaco_pagamento,
 p.amount as valor_pago,
 p.payment_date as data_pagamento,
 case
  when c.status = 'cancelado' then 'Cobranca cancelada'
  when c.kind <> 'saida' then 'Nao e uma conta a pagar'
  when o.space_id is distinct from c.space_id then 'Espaco da assinatura diferente da cobranca'
  when p.id is not null and p.space_id is distinct from c.space_id then 'Espaco do pagamento diferente da cobranca'
  else 'Conferir espaco da Visionario Dev e versao do deploy'
 end as diagnostico
from public.financial_origins o
join public.financial_charges c on c.origin_id=o.id
left join public.financial_payments p on p.charge_id=c.id
where o.description ilike '%claude%'
order by c.due_date, o.origin_type;
