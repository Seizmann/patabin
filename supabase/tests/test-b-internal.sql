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
  v_cat uuid;
  v_packet_b10 uuid;
  v_ent numeric;
  v_sum numeric;
  v_wal numeric;
begin
  p_su := (select id from public.partners where user_id = auth.uid());
  p_b := (select id from public.partners where user_id = (select id from public.profiles where role = 'patabin_admin'));
  select id into v_wallet from public.wallets where type = 'cash' limit 1;
  if v_wallet is null then
    insert into public.wallets (type, label) values ('cash', 'Cash') returning id into v_wallet;
  end if;

  v_cat := (select id from public.expense_categories where name = 'মোবাইল রিচার্জ');

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

  perform public.set_sell_priority(array[
    (select packet_id from public.v_packet_stock where chalan_id = v_chalan and owner_partner_id = p_b and packet_code = 'P-001'),
    (select packet_id from public.v_packet_stock where chalan_id = v_chalan and owner_partner_id = p_su and packet_code = 'P-011'),
    (select packet_id from public.v_packet_stock where chalan_id = v_chalan and owner_partner_id = p_b and packet_code = 'P-002'),
    (select packet_id from public.v_packet_stock where chalan_id = v_chalan and owner_partner_id = p_su and packet_code = 'P-012'),
    (select packet_id from public.v_packet_stock where chalan_id = v_chalan and owner_partner_id = p_b and packet_code = 'P-003'),
    (select packet_id from public.v_packet_stock where chalan_id = v_chalan and owner_partner_id = p_su and packet_code = 'P-013'),
    (select packet_id from public.v_packet_stock where chalan_id = v_chalan and owner_partner_id = p_b and packet_code = 'P-004'),
    (select packet_id from public.v_packet_stock where chalan_id = v_chalan and owner_partner_id = p_su and packet_code = 'P-014'),
    (select packet_id from public.v_packet_stock where chalan_id = v_chalan and owner_partner_id = p_b and packet_code = 'P-005'),
    (select packet_id from public.v_packet_stock where chalan_id = v_chalan and owner_partner_id = p_b and packet_code = 'P-006'),
    (select packet_id from public.v_packet_stock where chalan_id = v_chalan and owner_partner_id = p_b and packet_code = 'P-007'),
    (select packet_id from public.v_packet_stock where chalan_id = v_chalan and owner_partner_id = p_b and packet_code = 'P-008'),
    (select packet_id from public.v_packet_stock where chalan_id = v_chalan and owner_partner_id = p_b and packet_code = 'P-009'),
    (select packet_id from public.v_packet_stock where chalan_id = v_chalan and owner_partner_id = p_b and packet_code = 'P-010')
  ]);

  perform public.create_sale(jsonb_build_object('qty', 260, 'list_unit_price', 300, 'amount_received', 78000, 'wallet_account_id', v_wallet));

  select packet_id into v_packet_b10
  from public.v_packet_stock
  where chalan_id = v_chalan and owner_partner_id = p_b and remaining = 20;
  assert v_packet_b10 is not null, 'B packet with 20 left missing';

  perform public.create_personal_use(jsonb_build_object('eater_partner_id', p_su, 'packet_id', v_packet_b10, 'qty', 10, 'unit_value', 300));
  perform public.create_personal_use(jsonb_build_object('eater_partner_id', p_b, 'packet_id', v_packet_b10, 'qty', 10, 'unit_value', 300));

  perform public.create_expense(jsonb_build_object(
    'category_id', v_cat,
    'amount', 200,
    'paid_by_partner_id', p_su,
    'attributed_to_partner_id', p_b,
    'chalan_id', v_chalan
  ));

  select remaining into v_ent from public.v_chalan_summary where chalan_id = v_chalan;
  assert v_ent = 0, 'remaining ' || coalesce(v_ent::text, 'null');

  select entitlement into v_ent from public.v_partner_chalan_settlement where chalan_id = v_chalan and partner_id = p_b;
  assert v_ent = 56800.00, 'B entitlement ' || coalesce(v_ent::text, 'null');
  select entitlement into v_ent from public.v_partner_chalan_settlement where chalan_id = v_chalan and partner_id = p_su;
  assert v_ent = 21200.00, 'S entitlement ' || coalesce(v_ent::text, 'null');

  select sum(entitlement) into v_sum from public.v_partner_chalan_settlement where chalan_id = v_chalan;
  assert v_sum = 78000.00, 'entitlement sum ' || coalesce(v_sum::text, 'null');

  select sum(balance) into v_wal from public.v_wallet_balance;
  assert v_wal = 78000.00, 'wallet total ' || coalesce(v_wal::text, 'null');

  perform public.close_chalan(v_chalan);
  select sum(balance) into v_sum from public.v_partner_balance;
  assert v_sum = 78000.00, 'balance sum after close ' || coalesce(v_sum::text, 'null');
end $$;

rollback;
