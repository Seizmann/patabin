begin;
update public.profiles set must_change_password = false where id = (select id from public.profiles where role = 'su_admin');
update public.profiles set must_change_password = false where id = (select id from public.profiles where role = 'patabin_admin');
select set_config('request.jwt.claims', '{"sub":"' || (select id::text from public.profiles where role = 'su_admin') || '","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  p_su uuid;
  p_f uuid;
  b1 uuid;
  b2 uuid;
  v_rev numeric;
  v_alloc int;
begin
  p_su := (select id from public.partners where user_id = (select id from public.profiles where role = 'su_admin'));
  p_f := (select id from public.partners where user_id = (select id from public.profiles where role = 'patabin_admin'));

  b1 := public.create_batch(jsonb_build_object('purchase_date', now() - interval '1 day', 'unit_cost', 190,
    'contributions', jsonb_build_array(jsonb_build_object('partner_id', p_su, 'qty', 10, 'amount_paid', 1900))));
  b2 := public.create_batch(jsonb_build_object('purchase_date', now(), 'unit_cost', 200,
    'contributions', jsonb_build_array(jsonb_build_object('partner_id', p_f, 'qty', 10, 'amount_paid', 2000))));

  perform public.create_sale(jsonb_build_object('kind','external','received_by_partner_id',p_f,'qty',15,'list_unit_price',300,'amount_received',4500));

  select remaining into v_alloc from public.v_batch_stock where batch_id = b1;
  assert v_alloc = 0, 'b1 remaining ' || coalesce(v_alloc::text,'null');
  select remaining into v_alloc from public.v_batch_stock where batch_id = b2;
  assert v_alloc = 5, 'b2 remaining ' || coalesce(v_alloc::text,'null');

  select revenue into v_rev from public.v_batch_profit where batch_id = b1;
  assert v_rev = 3000, 'b1 revenue ' || coalesce(v_rev::text,'null');
  select revenue into v_rev from public.v_batch_profit where batch_id = b2;
  assert v_rev = 1500, 'b2 revenue ' || coalesce(v_rev::text,'null');

  begin
    perform public.create_sale(jsonb_build_object('kind','external','received_by_partner_id',p_f,'qty',6,'list_unit_price',300,'amount_received',1800));
    raise 'oversell was not rejected';
  exception
    when others then
      assert sqlerrm = 'NO_STOCK', 'unexpected error: ' || sqlerrm;
  end;

  assert (select coalesce(sum(qty),0) from public.sale_allocations) = 15, 'allocations leaked';
end $$;

rollback;
