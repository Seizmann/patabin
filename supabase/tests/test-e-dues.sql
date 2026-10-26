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
select set_config('request.jwt.claims', '{"sub":"' || (select id::text from public.profiles where role = 'su_admin') || '","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  p_su uuid;
  v_wallet uuid;
  v_chalan uuid;
  v_sale uuid;
  v_customer uuid;
  v_rem numeric;
  v_bal numeric;
  v_due numeric;
begin
  p_su := (select id from public.partners where user_id = auth.uid());
  select id into v_wallet from public.wallets where type = 'cash' limit 1;
  if v_wallet is null then
    insert into public.wallets (type, label) values ('cash', 'Cash') returning id into v_wallet;
  end if;

  insert into public.customers (name, phone) values ('কামরুল', '01712') returning id into v_customer;

  v_chalan := public.create_chalan(jsonb_build_object(
    'buy_rate', 190,
    'pcs_per_packet', 20,
    'items', jsonb_build_array(jsonb_build_object('partner_id', p_su, 'qty', 40, 'amount_paid', 7600))
  ));
  perform public.create_packets(jsonb_build_object(
    'chalan_id', v_chalan,
    'pcs_per_packet', 20,
    'items', jsonb_build_array(jsonb_build_object('partner_id', p_su, 'pcs', 40))
  ));

  v_sale := public.create_sale(jsonb_build_object(
    'qty', 10, 'list_unit_price', 300, 'amount_received', 2500, 'due_amount', 500,
    'customer_id', v_customer, 'wallet_account_id', v_wallet
  ));
  select discount into v_due from public.sales where id = v_sale;
  assert v_due = 0, 'discount should be 0 with due, got ' || coalesce(v_due::text, 'null');

  select sum(balance) into v_bal from public.v_customer_balance where customer_id = v_customer;
  assert v_bal = 500.00, 'customer due ' || coalesce(v_bal::text, 'null');

  select balance into v_bal from public.v_wallet_balance where wallet_id = v_wallet;
  assert v_bal = 2500, 'wallet should only hold received cash ' || coalesce(v_bal::text, 'null');

  begin
    perform public.create_sale(jsonb_build_object('qty', 5, 'list_unit_price', 300, 'amount_received', 1000, 'due_amount', 500, 'wallet_account_id', (select id from public.wallets where type = 'cash' limit 1)));
    raise 'due without customer must fail';
  exception when others then
    assert sqlerrm like '%SALE_DUE_NEEDS_CUSTOMER%', 'unexpected: ' || sqlerrm;
  end;

  perform public.create_customer_payment(jsonb_build_object('customer_id', v_customer, 'amount', 300, 'wallet_account_id', v_wallet));
  select balance into v_bal from public.v_customer_balance where customer_id = v_customer;
  assert v_bal = 200.00, 'customer due after payment ' || coalesce(v_bal::text, 'null');

  select sum(balance) into v_bal from public.v_wallet_balance;
  assert v_bal = 2800.00, 'wallet after payment ' || coalesce(v_bal::text, 'null');

  perform public.delete_sale(v_sale);
  select balance into v_bal from public.v_customer_balance where customer_id = v_customer;
  assert v_bal = -300.00, 'customer overpaid after sale deleted ' || coalesce(v_bal::text, 'null');
  select sum(balance) into v_bal from public.v_wallet_balance;
  assert v_bal = 300.00, 'payment stays after sale delete ' || coalesce(v_bal::text, 'null');

  select count(*) into v_rem from public.audit_log where table_name = 'customer_payments';
  assert v_rem >= 1, 'payment audit missing';
end $$;

rollback;
