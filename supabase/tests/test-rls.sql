begin;
set local session_replication_role = replica;
delete from public.chalan_close_snapshots;
delete from public.wallet_transfers;
delete from public.withdrawals;
delete from public.expenses;
delete from public.stock_adjustments;
delete from public.personal_uses;
delete from public.sale_allocations;
delete from public.customer_payment_allocations;
delete from public.customer_payments;
delete from public.sale_receives;
delete from public.sales;
delete from public.sell_priority;
delete from public.packets;
delete from public.chalan_purchases;
delete from public.chalans;
delete from public.customers;
set local session_replication_role = DEFAULT;
update public.profiles set must_change_password = false where id = (select id from public.profiles where role = 'su_admin');
update public.profiles set must_change_password = false where id = (select id from public.profiles where role = 'patabin_admin');
update public.profiles set role = 'patabin_admin'
where not exists (select 1 from public.profiles where role = 'patabin_admin')
  and id = coalesce(
    (select user_id from public.partners where name = 'Bappy' and user_id is not null limit 1),
    (select user_id from public.partners where user_id is not null limit 1));
delete from public.profile_permissions
where profile_id in (select id from public.profiles where role = 'patabin_admin');

set local role anon;
do $$
begin
  select 1 from public.chalans limit 1;
  raise 'anon read must fail';
exception
  when insufficient_privilege then
    perform 1;
end $$;

reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"' || (select id::text from public.profiles where role = 'patabin_admin') || '","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  assert has_table_privilege('authenticated', 'public.v_sales_enriched', 'select'),
    'authenticated must retain SELECT on v_sales_enriched';
  perform 1 from public.v_sales_enriched limit 1;
end $$;

do $$
begin
  update public.settings set default_sell_price = 999;
  assert not found, 'patabin_admin settings update must not apply';
  assert (select default_sell_price from public.settings where id = 1) = 300, 'patabin_admin must not change settings';
exception
  when insufficient_privilege then
    perform 1;
when others then
  perform 1;
end $$;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"' || (select id::text from public.profiles where role = 'patabin_admin') || '","role":"authenticated"}',
    true
  );
  begin
    update public.profiles set is_active = false where id = (select id from public.profiles where role = 'patabin_admin');
    raise 'patabin_admin must not deactivate via direct table write';
  exception
    when insufficient_privilege then perform 1;
  end;
  execute 'reset role';
  update public.profiles set is_active = false where id = (select id from public.profiles where role = 'patabin_admin');
  perform set_config(
    'request.jwt.claims',
    '{"sub":"' || (select id::text from public.profiles where role = 'patabin_admin') || '","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  if exists (select 1 from public.chalans) then
    raise 'deactivated user reads chalans';
  end if;
  if exists (select 1 from public.profiles) then
    raise 'deactivated user reads profiles';
  end if;
end $$;

reset role;
select set_config('request.jwt.claims', '{"sub":"' || (select id::text from public.profiles where role = 'su_admin') || '","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  update public.settings set default_sell_price = 999;
  assert found, 'su admin settings update did not apply';
  assert (select default_sell_price from public.settings where id = 1) = 999, 'su admin settings update failed';
end $$;

rollback;
