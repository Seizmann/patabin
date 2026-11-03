-- patabin_partner (Investor) read-only role tests.
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

-- seed one customer so the partner read test has a row
insert into public.customers (name) values ('read-test-customer');

-- create the partner user (as superuser paths are bypassed via replica/insert)
insert into auth.users (id, email, aud, role, encrypted_password, email_confirmed_at, created_at, updated_at)
values (gen_random_uuid(), 'partner-test@patabin.invalid', 'authenticated', 'authenticated', 'x', now(), now(), now());
insert into public.profiles (id, role, display_name, must_change_password, is_active)
values (
  (select id from auth.users where email = 'partner-test@patabin.invalid'),
  'patabin_partner', 'PT', false, true
);

-- ---------------------------------------------------------------- reads work
select set_config(
  'request.jwt.claims',
  '{"sub":"' || (select id::text from public.profiles where display_name = 'PT') || '","role":"authenticated"}',
  true
);
set local role authenticated;

do $$ begin
  perform 1 from public.customers where name = 'read-test-customer';
  perform 1 from public.profiles;
  perform 1 from public.settings;
  perform 1 from public.partners;
end $$;

-- ------------------------------------------------- direct table writes fail
do $$ begin
  insert into public.customers (name) values ('partner-cannot-insert');
  raise 'partner insert must fail';
exception when insufficient_privilege then perform 1; end $$;

do $$
declare v_rows integer;
begin
  update public.customers set name = 'partner-cannot-update' where name = 'read-test-customer';
  get diagnostics v_rows = row_count;
  assert v_rows = 0, 'partner must not update any row (got ' || v_rows || ')';
end $$;

do $$ begin
  insert into public.expenses (category_id, amount, paid_by_partner_id, attributed_to_partner_id)
  values (gen_random_uuid(), 10, gen_random_uuid(), gen_random_uuid());
  raise 'partner expense insert must fail';
exception when insufficient_privilege then perform 1; end $$;

-- ----------------------------------------------------- write RPCs fail
do $$ begin
  perform public.create_sale('{"qty": 1, "list_unit_price": 10, "amount_received": 10, "wallet_account_id": null}'::jsonb);
  raise 'partner create_sale must fail';
exception when others then
  assert sqlerrm like '%PARTNER_READ_ONLY%', 'unexpected: ' || sqlerrm;
end $$;

do $$ begin
  perform public.create_expense('{"amount": 10}'::jsonb);
  raise 'partner create_expense must fail';
exception when others then
  assert sqlerrm like '%PARTNER_READ_ONLY%', 'unexpected: ' || sqlerrm;
end $$;

do $$ begin
  perform public.set_sell_priority(array[gen_random_uuid()]);
  raise 'partner set_sell_priority must fail';
exception when others then
  assert sqlerrm like '%PARTNER_READ_ONLY%', 'unexpected: ' || sqlerrm;
end $$;

-- --------------------------------------------- partner cannot escalate role
do $$
declare v_rows integer;
begin
  update public.profiles set role = 'su_admin' where id = (select id from public.profiles where display_name = 'PT');
  get diagnostics v_rows = row_count;
  assert v_rows = 0, 'partner must not change own role (updated ' || v_rows || ')';
  assert (select role from public.profiles where display_name = 'PT') = 'patabin_partner', 'partner role must stay unchanged';
end $$;

-- ------------------------------------------------- admins still can write
do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"' || (select id::text from public.profiles where role = 'patabin_admin') || '","role":"authenticated"}',
    true
  );
  insert into public.customers (name) values ('admin-can-still-write');
end $$;

rollback;
