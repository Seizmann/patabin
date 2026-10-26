begin;
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
  v_rem numeric;
  v_bal numeric;
  v_pool numeric;
  v_goods numeric;
  v_rows int;
begin
  p_su := (select id from public.partners where user_id = auth.uid());
  select id into v_cash from public.wallets where type = 'cash' limit 1;
  if v_cash is null then
    insert into public.wallets (type, label) values ('cash', 'Cash') returning id into v_cash;
  end if;
  insert into public.wallets (type, label) values ('bkash', 'Bappy-র বিকাশ') returning id into v_bkash;

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

  v_sale := public.create_sale(jsonb_build_object('qty', 20, 'list_unit_price', 300, 'amount_received', 6000, 'wallet_account_id', v_cash, 'customer_name', 'মেহরাব'));
  select sum(remaining) into v_rem from public.v_packet_stock where chalan_id = v_chalan;
  assert v_rem = 20, 'stock ' || coalesce(v_rem::text, 'null');
  select sum(balance) into v_pool from public.v_wallet_balance;
  select sum(coalesce(remaining, 0) * 190) into v_goods from public.v_packet_stock where chalan_id = v_chalan;
  select balance into v_bal from public.v_partner_balance where partner_id = p_su;
  assert v_bal = 9800.00, 'balance ' || coalesce(v_bal::text, 'null');
  assert v_pool + v_goods = v_bal, 'identity ' || coalesce((v_pool + v_goods)::text, 'null') || ' vs ' || coalesce(v_bal::text, 'null');

  perform public.delete_sale(v_sale);
  select sum(remaining) into v_rem from public.v_packet_stock where chalan_id = v_chalan;
  assert v_rem = 40, 'stock after delete ' || coalesce(v_rem::text, 'null');
  select sum(balance) into v_pool from public.v_wallet_balance;
  select sum(coalesce(remaining, 0) * 190) into v_goods from public.v_packet_stock where chalan_id = v_chalan;
  select balance into v_bal from public.v_partner_balance where partner_id = p_su;
  assert v_bal = 7600.00, 'balance after delete ' || coalesce(v_bal::text, 'null');
  assert v_pool + v_goods = v_bal, 'identity after delete ' || coalesce((v_pool + v_goods)::text, 'null') || ' vs ' || coalesce(v_bal::text, 'null');

  perform public.create_sale(jsonb_build_object('qty', 5, 'list_unit_price', 300, 'amount_received', 1500, 'wallet_account_id', v_cash, 'customer_name', 'মেহরাব'));

  begin
    perform public.create_transfer(jsonb_build_object('from_wallet_id', v_cash, 'to_wallet_id', v_bkash, 'amount', 1000, 'charge', 20, 'attributed_to_partner_id', p_su));
    raise 'cash source charge must fail';
  exception when others then
    assert sqlerrm like '%TRANSFER_CASH_SOURCE_FREE%', 'unexpected: ' || sqlerrm;
  end;

  perform public.create_transfer(jsonb_build_object('from_wallet_id', v_cash, 'to_wallet_id', v_bkash, 'amount', 1000, 'charge', 0, 'attributed_to_partner_id', p_su));
  perform public.create_transfer(jsonb_build_object('from_wallet_id', v_bkash, 'to_wallet_id', v_cash, 'amount', 800, 'charge', 20, 'attributed_to_partner_id', p_su));

  select sum(balance) into v_pool from public.v_wallet_balance;
  select sum(coalesce(remaining, 0) * 190) into v_goods from public.v_packet_stock where chalan_id = v_chalan;
  select balance into v_bal from public.v_partner_balance where partner_id = p_su;
  assert v_bal = 8130.00, 'balance after transfers ' || coalesce(v_bal::text, 'null');
  assert v_pool + v_goods = v_bal, 'identity after transfers ' || coalesce((v_pool + v_goods)::text, 'null') || ' vs ' || coalesce(v_bal::text, 'null');

  perform public.create_withdrawal(jsonb_build_object('partner_id', p_su, 'wallet_account_id', v_cash, 'amount', 300, 'note', 'nije nilam'));
  select sum(balance) into v_pool from public.v_wallet_balance;
  select balance into v_bal from public.v_partner_balance where partner_id = p_su;
  assert v_bal = 7830.00, 'balance after withdrawal ' || coalesce(v_bal::text, 'null');
  assert v_pool + v_goods = v_bal, 'identity after withdrawal ' || coalesce((v_pool + v_goods)::text, 'null') || ' vs ' || coalesce(v_bal::text, 'null');

  select count(*) into v_rows from public.audit_log where table_name = 'sales' and action = 'I' and row_id = v_sale;
  assert v_rows = 1, 'audit sale insert missing';
  select count(*) into v_rows from public.audit_log where table_name = 'sales' and action = 'U' and row_id = v_sale;
  assert v_rows >= 1, 'audit sale soft delete missing';
  select count(*) into v_rows from public.audit_log where table_name = 'withdrawals';
  assert v_rows >= 1, 'audit withdrawal missing';
end $$;

rollback;
