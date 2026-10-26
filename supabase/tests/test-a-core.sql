begin;
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
  v_sale1 uuid;
  v_sale2 uuid;
  v_rem numeric;
  v_ent numeric;
  v_ext numeric;
  v_pcs_out numeric;
  v_cost numeric;
  v_profit numeric;
  v_sum numeric;
  v_wal numeric;
  v_inc numeric;
  v_net numeric;
begin
  p_su := (select id from public.partners where user_id = auth.uid());
  p_b := (select id from public.partners where user_id = (select id from public.profiles where role = 'patabin_admin'));
  assert p_su is not null and p_b is not null, 'partners missing';

  select id into v_wallet from public.wallets where type = 'cash' limit 1;
  if v_wallet is null then
    insert into public.wallets (type, label) values ('cash', 'Cash') returning id into v_wallet;
  end if;

  v_chalan := public.create_chalan(jsonb_build_object(
    'buy_rate', 190,
    'pcs_per_packet', 20,
    'items', jsonb_build_array(
      jsonb_build_object('partner_id', p_b, 'qty', 220, 'amount_paid', 41800),
      jsonb_build_object('partner_id', p_su, 'qty', 100, 'amount_paid', 19000)
    )
  ));

  perform public.create_personal_use(jsonb_build_object('eater_partner_id', p_b, 'chalan_id', v_chalan, 'qty', 20, 'unit_value', 300));
  perform public.create_personal_use(jsonb_build_object('eater_partner_id', p_su, 'chalan_id', v_chalan, 'qty', 20, 'unit_value', 300));

  perform public.create_packets(jsonb_build_object(
    'chalan_id', v_chalan,
    'pcs_per_packet', 20,
    'items', jsonb_build_array(
      jsonb_build_object('partner_id', p_b, 'pcs', 200),
      jsonb_build_object('partner_id', p_su, 'pcs', 80)
    )
  ));

  v_sale1 := public.create_sale(jsonb_build_object('qty', 275, 'list_unit_price', 300, 'amount_received', 82250, 'wallet_account_id', v_wallet));
  v_sale2 := public.create_sale(jsonb_build_object('qty', 5, 'list_unit_price', 300, 'amount_received', 1450, 'wallet_account_id', v_wallet));
  assert v_sale1 is not null and v_sale2 is not null, 'sales not created';

  select remaining into v_rem from public.v_packet_stock where packet_id in (select packet_id from public.sell_priority);
  assert v_rem = 0, 'remaining ' || coalesce(abs(v_rem)::text, 'null');
  assert v_rem = 0, 'some packet has stock left';

  select ext_rev, pcs_out, cost, profit, entitlement into v_ext, v_pcs_out, v_cost, v_profit, v_ent
  from public.v_partner_chalan_settlement where chalan_id = v_chalan and partner_id = p_b;
  assert v_ext = 59818.18, 'B ext_rev ' || coalesce(v_ext::text, 'null');
  assert v_pcs_out = 220, 'B pcs_out ' || coalesce(v_pcs_out::text, 'null');
  assert v_cost = 41800, 'B cost ' || coalesce(v_cost::text, 'null');
  assert v_profit = 18018.18, 'B profit ' || coalesce(v_profit::text, 'null');
  assert v_ent = 59818.18, 'B entitlement ' || coalesce(v_ent::text, 'null');

  select ext_rev, pcs_out, cost, profit, entitlement into v_ext, v_pcs_out, v_cost, v_profit, v_ent
  from public.v_partner_chalan_settlement where chalan_id = v_chalan and partner_id = p_su;
  assert v_ext = 23881.82, 'S ext_rev ' || coalesce(v_ext::text, 'null');
  assert v_pcs_out = 100, 'S pcs_out ' || coalesce(v_pcs_out::text, 'null');
  assert v_cost = 19000, 'S cost ' || coalesce(v_cost::text, 'null');
  assert v_profit = 4881.82, 'S profit ' || coalesce(v_profit::text, 'null');
  assert v_ent = 23881.82, 'S entitlement ' || coalesce(v_ent::text, 'null');

  select sum(entitlement) into v_sum from public.v_partner_chalan_settlement where chalan_id = v_chalan;
  assert v_sum = 83700.00, 'entitlement sum ' || coalesce(v_sum::text, 'null');

  select balance into v_wal from public.v_wallet_balance where type = 'cash';
  assert v_wal = 83700.00, 'wallet ' || coalesce(v_wal::text, 'null');

  perform public.close_chalan(v_chalan);

  select sum(balance) into v_sum from public.v_partner_balance;
  assert v_sum = 83700.00, 'partner balance sum ' || coalesce(v_sum::text, 'null');
  select balance into v_ent from public.v_partner_balance where partner_id = p_b;
  assert v_ent = 59818.18, 'B snapshot balance ' || coalesce(v_ent::text, 'null');

  select income, net_profit into v_inc, v_net
  from public.dashboard_totals(now() - interval '1 hour', now() + interval '1 hour');
  assert v_inc = 95700.00, 'dashboard income ' || coalesce(v_inc::text, 'null');
  assert v_net = 22900.00, 'dashboard net profit ' || coalesce(v_net::text, 'null');
end $$;

rollback;
