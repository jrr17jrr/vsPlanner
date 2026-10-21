alter table public.clt_campaigns add column if not exists created_in_meta boolean not null default false;
comment on column public.clt_campaigns.created_in_meta is 'Indica cadastro manual no Meta Ads, independente do status de veiculacao.';
