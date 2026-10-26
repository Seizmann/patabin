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
select set_config('request.jwt.claims', '{"sub":"' || (select id::text from public.profiles where role = 'su_admin') || '","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  p_su uuid;
  p_b uuid;
  v_wallet uuid;
  v_chalan uuid;
  v_sale uuid;
  v_sales_before int;
  v_p1 uuid;
  v_p3 uuid;
  v_b_pkg text;
  v_pkg uuid;
  v_rem numeric;
  v_ext numeric;
  v_pos_1 integer;
  v_pos_2 integer;
begin
  p_su := (select id from public.partners where user_id = auth.uid());
  p_b := (select id from public.partners where user_id = (select id from public.profiles where role = 'patabin_admin'));
  select id into v_wallet from public.wallets where type = 'cash' limit 1;
  if v_wallet is null then
    insert into public.wallets (type, label) values ('cash', 'Cash') returning id into v_wallet;
  end if;

  v_chalan := public.create_chalan(jsonb_build_object(
    'buy_rate', 190,
    'pcs_per_packet', 20,
    'items', jsonb_build_array(
      jsonb_build_object('partner_id', p_b, 'qty', 40, 'amount_paid', 7600),
      jsonb_build_object('partner_id', p_su, 'qty', 40, 'amount_paid', 7600)
    )
  ));
  perform public.create_packets(jsonb_build_object(
    'chalan_id', v_chalan,
    'pcs_per_packet', 20,
    'items', jsonb_build_array(
      jsonb_build_object('partner_id', p_b, 'pcs', 40),
      jsonb_build_object('partner_id', p_su, 'pcs', 40)
    )
  ));

  select packet_id into v_p1 from public.v_packet_stock where chalan_id = v_chalan and packet_code = 'P-001';
  select packet_id into v_p3 from public.v_packet_stock where chalan_id = v_chalan and packet_code = 'P-003';
  perform public.set_sell_priority(array[v_p1, v_p3, (select packet_id from public.v_packet_stock where chalan_id = v_chalan and packet_code = 'P-002'), (select packet_id from public.v_packet_stock where chalan_id = v_chalan and packet_code = 'P-004')]);

  select position into v_pos_1 from public.v_packet_stock where packet_id = v_p1;
  select position into v_pos_2 from public.v_packet_stock where packet_id = v_p3;
  assert v_pos_1 = 1 and v_pos_2 = 2, 'priority order not persisted';

  v_sale := public.create_sale(jsonb_build_object('qty', 25, 'list_unit_price', 300, 'amount_received', 7500, 'wallet_account_id', v_wallet, 'customer_name', 'কামরুল ভাই'));

  select string_agg(distinct pk.packet_code, ',') into v_b_pkg
  from public.sale_allocations sa
  join public.v_packet_stock pk on pk.packet_id = sa.packet_id
  where sa.sale_id = v_sale;
  assert v_b_pkg = 'P-001,P-003', 'allocations ' || coalesce(v_b_pkg::text, 'null');

  select ext_rev into v_ext from public.v_partner_chalan_settlement where chalan_id = v_chalan and partner_id = p_b;
  assert v_ext = 6000.00, 'B share ' || coalesce(v_ext::text, 'null');
  select ext_rev into v_ext from public.v_partner_chalan_settlement where chalan_id = v_chalan and partner_id = p_su;
  assert v_ext = 1500.00, 'S share ' || coalesce(v_ext::text, 'null');

  perform public.create_sale(jsonb_build_object('qty', 30, 'list_unit_price', 300, 'amount_received', 9000, 'wallet_account_id', v_wallet));
  select sum(remaining) into v_rem from public.v_packet_stock where chalan_id = v_chalan;
  assert v_rem = 25, 'remaining after sales ' || coalesce(v_rem::text, 'null');

  select count(*) into v_sales_before from public.sales;

  begin
    perform public.create_sale(jsonb_build_object('qty', 100, 'list_unit_price', 300, 'amount_received', 30000, 'wallet_account_id', (select id from public.wallets where type = 'cash')));
    raise 'oversell must fail';
  exception when others then
    assert sqlerrm like '%NO_STOCK%', 'unexpected: ' || sqlerrm;
  end;

  assert (select count(*) from public.sales) = v_sales_before, 'oversell left rows';

  select packet_id into v_pkg from public.v_packet_stock where chalan_id = v_chalan and packet_code = 'P-002';
  perform public.create_adjustment(jsonb_build_object('packet_id', v_pkg, 'qty', 5, 'reason', 'gift', 'person', 'শাকিল', 'at', now()));
  select packet_id into v_pkg from public.v_packet_stock where chalan_id = v_chalan and packet_code = 'P-004';
  perform public.create_adjustment(jsonb_build_object('packet_id', v_pkg, 'qty', 20, 'reason', 'damage'));

  perform public.close_chalan(v_chalan);
  select sum(balance) into v_rem from public.v_partner_balance;
  assert v_rem = 16500.00, 'balance sum ' || coalesce(v_rem::text, 'null');
  select balance into v_rem from public.v_wallet_balance where type = 'cash';
  assert v_rem = 16500.00, 'wallet ' || coalesce(v_rem::text, 'null');
end $$;

rollback;
