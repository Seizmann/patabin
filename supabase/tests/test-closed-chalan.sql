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
  p_b uuid;
  v_wallet uuid;
  v_chalan uuid;
  v_sale uuid;
  v_pkg uuid;
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
  v_sale := public.create_sale(jsonb_build_object('qty', 20, 'list_unit_price', 300, 'amount_received', 6000, 'wallet_account_id', v_wallet));

  begin
    perform public.close_chalan(v_chalan);
    raise 'close must fail with stock left';
  exception when others then
    assert sqlerrm like '%STOCK_LEFT%', 'unexpected: ' || sqlerrm;
  end;

  select packet_id into v_pkg from public.v_packet_stock where chalan_id = v_chalan and remaining = 20 order by packet_code limit 1;
  perform public.create_adjustment(jsonb_build_object('packet_id', v_pkg, 'qty', 20, 'reason', 'loss'));
  select packet_id into v_pkg from public.v_packet_stock where chalan_id = v_chalan and remaining = 20 order by packet_code limit 1;
  perform public.create_adjustment(jsonb_build_object('packet_id', v_pkg, 'qty', 20, 'reason', 'loss'));
  select packet_id into v_pkg from public.v_packet_stock where chalan_id = v_chalan and remaining = 20 order by packet_code limit 1;
  perform public.create_adjustment(jsonb_build_object('packet_id', v_pkg, 'qty', 20, 'reason', 'loss'));
  perform public.close_chalan(v_chalan);

  begin
    perform public.update_sale(v_sale, jsonb_build_object('qty', 25, 'list_unit_price', 300, 'amount_received', 7500, 'wallet_account_id', v_wallet));
    raise 'closed chalan sale edit must fail';
  exception when others then
    assert sqlerrm in ('CHALAN_CLOSED', 'NO_STOCK'), 'unexpected: ' || sqlerrm;
  end;

  begin
    insert into public.chalan_purchases (chalan_id, partner_id, qty, amount_paid) values (v_chalan, p_su, 5, 950);
    raise 'closed chalan purchase edit must fail';
  exception when others then
    assert sqlerrm like '%CHALAN_CLOSED%', 'unexpected: ' || sqlerrm;
  end;

  perform set_config('request.jwt.claims', '{"sub":"' || (select id::text from public.profiles where role = 'patabin_admin') || '","role":"authenticated"}', true);
  perform public.reopen_chalan(v_chalan);
  assert (select status from public.chalans where id = v_chalan) = 'open', 'chalan not reopened';
  assert not exists (select 1 from public.chalan_close_snapshots where chalan_id = v_chalan), 'snapshot must be removed on reopen';
end $$;

rollback;
