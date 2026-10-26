begin;
set local session_replication_role = replica;
delete from public.chalan_close_snapshots;
delete from public.wallet_transfers;
delete from public.withdrawals;
delete from public.expenses;
delete from public.stock_adjustments;
delete from public.personal_uses;
delete from public.sale_allocations;
delete from public.sales;
delete from public.sell_priority;
delete from public.packets;
delete from public.chalan_purchases;
delete from public.chalans;
delete from public.customers;
set local session_replication_role = DEFAULT;
update public.profiles set must_change_password = false where id = (select id from public.profiles where role = 'su_admin');
update public.profiles set must_change_password = false where id = (select id from public.profiles where role = 'patabin_admin');

update public.profiles set must_change_password = true where id = (select id from public.profiles where role = 'su_admin');

select set_config('request.jwt.claims', '{"sub":"' || (select id::text from public.profiles where role = 'su_admin') || '","role":"authenticated"}', true);
set local role authenticated;

do $$ begin
  insert into public.chalans (code) values ('TEST-PENDING-1');
  raise 'pending write missing';
exception when insufficient_privilege then
  assert sqlerrm like '%row-level security%' or sqlerrm like '%CHANGE_PASSWORD%' or sqlerrm like '%password_gate%', 'unexpected: ' || sqlerrm;
end $$;

do $$ begin
  perform public.complete_password_change();
  raise 'flag clear must fail without password change';
exception when others then
  assert sqlerrm like '%PASSWORD_CHANGE_REQUIRED%', 'unexpected: ' || sqlerrm;
end $$;

do $$
declare
  v_su uuid := (select id from public.profiles where role = 'su_admin');
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"' || v_su || '","role":"authenticated"}',
    true
  );
  assert (select must_change_password from public.profiles where id = v_su) = true, 'flag must remain true';
  assert (select password_hash_snapshot <> '' from public.profiles where id = v_su), 'snapshot must be stamped';
end $$;

rollback;
