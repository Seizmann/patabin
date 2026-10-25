begin;
update public.profiles set must_change_password = false where id = (select id from public.profiles where role = 'su_admin');
update public.profiles set must_change_password = false where id = (select id from public.profiles where role = 'patabin_admin');
select set_config('request.jwt.claims', '{"sub":"' || (select id::text from public.profiles where role = 'su_admin') || '","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  p_su uuid;
  p_f uuid;
  v_batch uuid;
  v_s numeric;
  v_f numeric;
begin
  p_su := (select id from public.partners where user_id = (select id from public.profiles where role = 'su_admin'));
  p_f := (select id from public.partners where user_id = (select id from public.profiles where role = 'patabin_admin'));

  v_batch := public.create_batch(jsonb_build_object(
    'purchase_date', now(),
    'unit_cost', 190,
    'contributions', jsonb_build_array(
      jsonb_build_object('partner_id', p_su, 'qty', 100, 'amount_paid', 19000),
      jsonb_build_object('partner_id', p_f, 'qty', 200, 'amount_paid', 38000)
    )
  ));

  perform public.create_sale(jsonb_build_object('kind','external','received_by_partner_id',p_f,'qty',265,'list_unit_price',300,'amount_received',79500));
  perform public.create_sale(jsonb_build_object('kind','external','received_by_partner_id',p_f,'qty',5,'list_unit_price',300,'amount_received',1450));
  perform public.create_sale(jsonb_build_object('kind','internal','partner_id',p_su,'qty',8,'list_unit_price',300,'amount_received',2400));
  perform public.create_sale(jsonb_build_object('kind','internal','partner_id',p_f,'qty',22,'list_unit_price',300,'amount_received',6600));
  perform public.close_batch(v_batch);

  select balance into v_s from public.v_partner_balance where partner_id = p_su;
  select balance into v_f from public.v_partner_balance where partner_id = p_f;
  assert abs(v_s - 27583.33) < 0.01, 'S balance ' || coalesce(v_s::text,'null');
  assert abs(v_f + 27583.33) < 0.01, 'F balance ' || coalesce(v_f::text,'null');

  insert into public.transfers (from_partner_id, to_partner_id, amount, method)
  values (p_f, p_su, 27583.33, 'cash');

  select balance into v_s from public.v_partner_balance where partner_id = p_su;
  select balance into v_f from public.v_partner_balance where partner_id = p_f;
  assert abs(v_s) < 0.01, 'S balance after transfer ' || coalesce(v_s::text,'null');
  assert abs(v_f) < 0.01, 'F balance after transfer ' || coalesce(v_f::text,'null');
end $$;

rollback;
