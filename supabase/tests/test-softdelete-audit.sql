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
  v_sale uuid;
  v_rem numeric;
  v_bal numeric;
  v_rows int;
begin
  p_su := (select id from public.partners where user_id = (select id from public.profiles where role = 'su_admin'));
  p_f := (select id from public.partners where user_id = (select id from public.profiles where role = 'patabin_admin'));
  v_batch := public.create_batch(jsonb_build_object('purchase_date', now(), 'unit_cost', 190,
    'contributions', jsonb_build_array(jsonb_build_object('partner_id', p_f, 'qty', 50, 'amount_paid', 9500))));
  v_sale := public.create_sale(jsonb_build_object('kind','external','received_by_partner_id',p_f,'qty',5,'list_unit_price',300,'amount_received',1500));

  select remaining into v_rem from public.v_batch_stock where batch_id = v_batch;
  assert v_rem = 45, 'stock ' || coalesce(v_rem::text,'null');
  select cash_held into v_bal from public.v_partner_balance where partner_id = p_f;
  assert v_bal = 1500, 'cash held ' || coalesce(v_bal::text,'null');

  perform public.delete_sale(v_sale);

  select remaining into v_rem from public.v_batch_stock where batch_id = v_batch;
  assert v_rem = 50, 'stock after delete ' || coalesce(v_rem::text,'null');
  select cash_held into v_bal from public.v_partner_balance where partner_id = p_f;
  assert v_bal = 0, 'cash held after delete ' || coalesce(v_bal::text,'null');

  insert into public.transfers (from_partner_id, to_partner_id, amount, method) values (p_f, p_su, 100, 'cash');

  select sum(1) into v_rows from public.audit_log;
  assert v_rows >= 6, 'audit rows ' || coalesce(v_rows::text,'null');
  select sum(1) into v_rows from public.audit_log where table_name = 'sales' and action = 'I' and row_id = v_sale;
  assert v_rows = 1, 'audit insert row missing';
end $$;

rollback;
