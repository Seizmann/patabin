begin;
set local session_replication_role = replica;
delete from public.chalan_close_snapshots;
delete from public.wallet_transfers;
delete from public.customer_payments;
delete from public.withdrawals;
delete from public.expenses;
delete from public.stock_adjustments;
delete from public.personal_uses;
delete from public.sale_receives;
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
select set_config('request.jwt.claims', '{"sub":"' || (select id::text from public.profiles where role = 'su_admin') || '","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  p_su uuid;
  v_cash uuid;
  v_bkash uuid;
  v_chalan uuid;
  v_sale uuid;
  v_customer uuid;
  v_cash_bal numeric;
  v_bkash_bal numeric;
  v_parts int;
  v_details text;
begin
  p_su := (select id from public.partners where user_id = auth.uid());
  select id into v_cash from public.wallets where type = 'cash' limit 1;
  if v_cash is null then
    insert into public.wallets (type, label, name) values ('cash', 'Cash', 'Cash') returning id into v_cash;
  end if;
  insert into public.wallets (type, name, label) values ('bkash', 'Bappy', '01920669997') returning id into v_bkash;

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
    'qty', 10, 'list_unit_price', 300, 'amount_received', 3000,
    'wallet_account_id', v_cash,
    'receives', jsonb_build_array(
      jsonb_build_object('wallet_account_id', v_cash, 'amount', 1000),
      jsonb_build_object('wallet_account_id', v_bkash, 'amount', 2000)
    )
  ));

  select balance into v_cash_bal from public.v_wallet_balance where wallet_id = v_cash;
  assert v_cash_bal = 1000, 'cash part ' || coalesce(v_cash_bal::text, 'null');
  select balance into v_bkash_bal from public.v_wallet_balance where wallet_id = v_bkash;
  assert v_bkash_bal = 2000, 'bkash part ' || coalesce(v_bkash_bal::text, 'null');

  select count(*) into v_parts from public.sale_receives where sale_id = v_sale;
  assert v_parts = 2, 'receive rows ' || v_parts;

  insert into public.customers (name, phone) values ('মেহরাব', '01555') returning id into v_customer;
  v_sale := public.create_sale(jsonb_build_object(
    'qty', 5, 'list_unit_price', 300, 'amount_received', 1000, 'due_amount', 500,
    'customer_id', v_customer, 'wallet_account_id', v_cash,
    'receives', jsonb_build_array(
      jsonb_build_object('wallet_account_id', v_cash, 'amount', 400),
      jsonb_build_object('wallet_account_id', v_bkash, 'amount', 600)
    )
  ));
  perform public.create_customer_payment(jsonb_build_object('customer_id', v_customer, 'amount', 500, 'wallet_account_id', (select id from public.wallets where type = 'cash' limit 1)));

  begin
    perform public.create_sale(jsonb_build_object(
      'qty', 5, 'list_unit_price', 300, 'amount_received', 1500, 'wallet_account_id', v_cash,
      'receives', jsonb_build_array(
        jsonb_build_object('wallet_account_id', v_cash, 'amount', 900),
        jsonb_build_object('wallet_account_id', v_bkash, 'amount', 500)
      )
    ));
    raise 'split mismatch must fail';
  exception when others then
    assert sqlerrm like '%RECEIVE_SPLIT_MISMATCH%', 'unexpected: ' || sqlerrm;
  end;

  select into v_details wallet_details from public.v_sales_enriched where id = v_sale;
  assert v_details like '%··%', 'wallet details missing';
end $$;

rollback;
