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
  v_pa numeric;
  v_pb numeric;
  v_profit numeric;
begin
  p_su := (select id from public.partners where user_id = (select id from public.profiles where role = 'su_admin'));
  p_f := (select id from public.partners where user_id = (select id from public.profiles where role = 'patabin_admin'));

  v_batch := public.create_batch(jsonb_build_object(
    'purchase_date', now(),
    'unit_cost', 190,
    'contributions', jsonb_build_array(
      jsonb_build_object('partner_id', p_su, 'qty', 100, 'amount_paid', 19000),
      jsonb_build_object('partner_id', p_f, 'qty', 200, 'amount_paid', 38000)
    ),
    'expenses', jsonb_build_array(jsonb_build_object(
      'paid_by_partner_id', p_f, 'amount', 600, 'category', 'transport', 'cost_type', 'landed', 'funding', 'own_pocket'
    ))
  ));

  perform public.create_sale(jsonb_build_object('kind','external','received_by_partner_id',p_f,'qty',265,'list_unit_price',300,'amount_received',79500));
  perform public.create_sale(jsonb_build_object('kind','external','received_by_partner_id',p_f,'qty',5,'list_unit_price',300,'amount_received',1450));
  perform public.create_sale(jsonb_build_object('kind','internal','partner_id',p_su,'qty',8,'list_unit_price',300,'amount_received',2400));
  perform public.create_sale(jsonb_build_object('kind','internal','partner_id',p_f,'qty',22,'list_unit_price',300,'amount_received',6600));

  select profit into v_profit from public.v_batch_profit where batch_id = v_batch;
  assert v_profit = 32350, 'profit ' || coalesce(v_profit::text,'null');

  perform public.close_batch(v_batch);
  select payout into v_pa from public.v_partner_batch_payout where batch_id = v_batch and partner_id = p_su;
  select payout into v_pb from public.v_partner_batch_payout where batch_id = v_batch and partner_id = p_f;
  assert abs(v_pa - 27271.01) < 0.02, 'S payout ' || coalesce(v_pa::text,'null');
  assert abs(v_pb - 53678.99) < 0.02, 'F payout ' || coalesce(v_pb::text,'null');
  assert abs(v_pa + v_pb - 80950) < 0.01, 'payout sum ' || (v_pa + v_pb)::text;
end $$;

rollback;
