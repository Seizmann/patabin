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
  v_sale1 uuid;
  v_sale2 uuid;
  v_rem numeric;
  v_profit numeric;
  v_revenue numeric;
  v_sum numeric;
  v_pa numeric;
  v_pb numeric;
  v_inc numeric;
  v_exp numeric;
  v_net numeric;
begin
  p_su := (select id from public.partners where user_id = auth.uid());
  p_f := (select id from public.partners where user_id = (select id from public.profiles where role = 'patabin_admin'));
  assert p_su is not null, 'SU partner missing';
  assert p_f is not null, 'Patabin partner missing';

  v_batch := public.create_batch(jsonb_build_object(
    'purchase_date', now(),
    'unit_cost', 190,
    'contributions', jsonb_build_array(
      jsonb_build_object('partner_id', p_su, 'qty', 100, 'amount_paid', 19000),
      jsonb_build_object('partner_id', p_f, 'qty', 200, 'amount_paid', 38000)
    )
  ));

  v_sale1 := public.create_sale(jsonb_build_object(
    'kind', 'external',
    'received_by_partner_id', p_f,
    'qty', 265,
    'list_unit_price', 300,
    'amount_received', 79500
  ));
  v_sale2 := public.create_sale(jsonb_build_object(
    'kind', 'external',
    'received_by_partner_id', p_f,
    'qty', 5,
    'list_unit_price', 300,
    'amount_received', 1450
  ));
  assert v_sale1 is not null and v_sale2 is not null, 'sales not created';

  perform public.create_sale(jsonb_build_object('kind','internal','partner_id',p_su,'qty',8,'list_unit_price',300,'amount_received',2400));
  perform public.create_sale(jsonb_build_object('kind','internal','partner_id',p_f,'qty',22,'list_unit_price',300,'amount_received',6600));

  select remaining into v_rem from public.v_batch_stock where batch_id = v_batch;
  assert v_rem = 0, 'remaining should be 0, got ' || coalesce(v_rem::text,'null');

  select profit, revenue into v_profit, v_revenue from public.v_batch_profit where batch_id = v_batch;
  assert v_revenue = 89950, 'revenue ' || coalesce(v_revenue::text,'null');
  assert v_profit = 32950, 'profit ' || coalesce(v_profit::text,'null');

  select sum(payout) into v_sum from public.v_partner_batch_payout where batch_id = v_batch;
  assert v_sum = 80950, 'payout sum ' || coalesce(v_sum::text,'null');

  perform public.close_batch(v_batch);
  select payout into v_pa from public.v_partner_batch_payout where batch_id = v_batch and partner_id = p_su;
  select payout into v_pb from public.v_partner_batch_payout where batch_id = v_batch and partner_id = p_f;
  assert abs(v_pa - 27583.33) < 0.01, 'S payout ' || coalesce(v_pa::text,'null');
  assert abs(v_pb - 53366.67) < 0.01, 'F payout ' || coalesce(v_pb::text,'null');

  select income, expenses, net_profit into v_inc, v_exp, v_net
  from public.dashboard_totals(now() - interval '1 hour', now() + interval '1 hour');
  assert v_inc = 89950, 'dashboard income ' || coalesce(v_inc::text,'null');
  assert v_exp = 0, 'dashboard expenses ' || coalesce(v_exp::text,'null');
  assert v_net = 32950, 'dashboard net profit ' || coalesce(v_net::text,'null');
end $$;

rollback;
