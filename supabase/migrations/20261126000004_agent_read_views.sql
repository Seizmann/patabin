create or replace view public.v_expenses_enriched with (security_invoker = true) as
select
  e.id,
  e.amount,
  e.note,
  e.spent_at,
  e.chalan_id,
  e.created_by,
  e.created_at,
  e.deleted_at,
  e.source,
  e.agent_model,
  c.name as category_name,
  paid.name as paid_by_name,
  attr.name as attributed_to_name,
  coalesce(w.label, w.name) as wallet_label,
  ch.code as chalan_code
from public.expenses e
join public.expense_categories c on c.id = e.category_id
join public.partners paid on paid.id = e.paid_by_partner_id
join public.partners attr on attr.id = e.attributed_to_partner_id
left join public.wallets w on w.id = e.wallet_account_id
left join public.chalans ch on ch.id = e.chalan_id;

create or replace view public.v_personal_uses_enriched with (security_invoker = true) as
select
  pu.id,
  pu.qty,
  pu.unit_value,
  pu.note,
  pu.at,
  pu.packet_id,
  pu.chalan_id,
  pu.created_by,
  pu.created_at,
  pu.deleted_at,
  pu.source,
  pu.agent_model,
  eater.name as eater_name,
  case when p.id is null then 'kept' else p.code end as packet_code,
  owner.name as owner_name,
  case when p.id is not null and p.owner_partner_id <> pu.eater_partner_id
    then pu.qty * pu.unit_value else 0 end as value_owed
from public.personal_uses pu
join public.partners eater on eater.id = pu.eater_partner_id
left join public.packets p on p.id = pu.packet_id
left join public.partners owner on owner.id = p.owner_partner_id;

create or replace view public.v_adjustments_enriched with (security_invoker = true) as
select
  sa.id,
  sa.qty,
  sa.reason,
  sa.person,
  sa.note,
  sa.at,
  sa.packet_id,
  sa.created_by,
  sa.created_at,
  sa.deleted_at,
  sa.source,
  sa.agent_model,
  p.code as packet_code,
  owner.name as owner_name,
  ch.buy_rate * sa.qty as cost_borne
from public.stock_adjustments sa
join public.packets p on p.id = sa.packet_id
join public.partners owner on owner.id = p.owner_partner_id
join public.chalans ch on ch.id = p.chalan_id;

create or replace view public.v_sales_agent with (security_invoker = true) as
select
  s.*,
  src.source,
  src.agent_model
from public.v_sales_enriched s
join public.sales src on src.id = s.id;

revoke all on public.v_expenses_enriched from anon;
revoke all on public.v_personal_uses_enriched from anon;
revoke all on public.v_adjustments_enriched from anon;
revoke all on public.v_sales_agent from anon;
grant select on public.v_expenses_enriched to authenticated;
grant select on public.v_personal_uses_enriched to authenticated;
grant select on public.v_adjustments_enriched to authenticated;
grant select on public.v_sales_agent to authenticated;

do $$
begin
  create extension if not exists pg_cron;
  begin
    perform cron.unschedule('agent-purge-history');
  exception
    when others then
      null;
  end;
  perform cron.schedule(
    'agent-purge-history',
    '17 3 * * *',
    $job$select public.agent_purge_history_impl()$job$
  );
exception
  when others then
    null;
end $$;
