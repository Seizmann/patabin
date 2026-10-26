begin;
set local session_replication_role = replica;
delete from public.chalan_close_snapshots;
delete from public.wallet_transfers;
delete from public.withdrawals;
delete from public.expenses;
delete from public.stock_adjustments;
delete from public.personal_uses;
delete from public.sale_allocations;
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

select set_config(
  'request.jwt.claims',
  '{"sub":"' || (select id::text from public.profiles where role = 'patabin_admin') || '","role":"authenticated"}',
  true
);
set local role authenticated;

do $$ begin
  insert into public.audit_log (table_name, action) values ('hack', 'I');
  raise 'audit insert must fail';
exception when insufficient_privilege then perform 1; end $$;

do $$ begin
  update public.audit_log set old_data = '{}';
  raise 'audit update must fail';
exception when insufficient_privilege then perform 1; end $$;

do $$ begin
  delete from public.audit_log;
  raise 'audit delete must fail';
exception when insufficient_privilege then perform 1; end $$;

do $$ begin
  update public.profiles set role = 'su_admin' where id = (select id from public.profiles where role = 'patabin_admin');
  raise 'self role change must fail';
exception when others then
  assert sqlerrm like '%SELF_ROLE_CHANGE%', 'unexpected: ' || sqlerrm;
end $$;

do $$ begin
  update public.profiles set is_active = false where id = (select id from public.profiles where role = 'su_admin');
  raise 'su modification by patabin must fail';
exception when others then
  assert sqlerrm like '%SU_ADMIN_PROTECTED%', 'unexpected: ' || sqlerrm;
end $$;

reset role;

insert into auth.users (id, email, aud, role, encrypted_password, email_confirmed_at, created_at, updated_at)
values (gen_random_uuid(), 'sa2-test@patabin.invalid', 'authenticated', 'authenticated', 'x', now(), now(), now());
insert into public.profiles (id, role, display_name, must_change_password, is_active)
values ((select id from auth.users where email = 'sa2-test@patabin.invalid'), 'su_admin', 'SA2', false, true);

do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"' || (select id from public.profiles where role = 'patabin_admin') || '","role":"authenticated"}',
    true
  );
  update public.profiles set is_active = false where id = (select id from auth.users where email = 'sa2-test@patabin.invalid');
  raise 'patabin deactivating su must fail';
exception when others then
  assert sqlerrm like '%SU_ADMIN_PROTECTED%', 'unexpected: ' || sqlerrm;
end $$;

set local role postgres;

do $$
declare
  p_su uuid := (select id from public.profiles where role = 'su_admin' and display_name <> 'SA2');
  sa2 uuid := (select id from public.profiles where display_name = 'SA2');
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"' || p_su || '","role":"authenticated"}',
    true
  );
  update public.profiles set is_active = false where id = sa2;
  assert (select is_active from public.profiles where id = sa2) = false, 'su should be able to deactivate other su';

  begin
    update public.profiles set is_active = false where id = p_su;
    raise 'last active su_admin must not deactivate';
  exception when others then
    assert sqlerrm like '%LAST_SU_ADMIN%', 'unexpected: ' || sqlerrm;
  end;
end $$;

rollback;
