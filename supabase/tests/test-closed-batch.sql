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
  v_id uuid;
begin
  p_su := (select id from public.partners where user_id = (select id from public.profiles where role = 'su_admin'));
  p_f := (select id from public.partners where user_id = (select id from public.profiles where role = 'patabin_admin'));
  v_batch := public.create_batch(jsonb_build_object('purchase_date', now(), 'unit_cost', 190,
    'contributions', jsonb_build_array(jsonb_build_object('partner_id', p_su, 'qty', 100, 'amount_paid', 19000))));
  perform public.create_sale(jsonb_build_object('kind','internal','partner_id',p_su,'qty',10,'list_unit_price',300,'amount_received',3000));

  begin
    perform public.close_batch(v_batch);
    raise 'close must fail with stock left';
  exception
    when others then
      assert sqlerrm = 'STOCK_LEFT', 'unexpected: ' || sqlerrm;
  end;

  insert into public.stock_adjustments (batch_id, qty, reason, note) values (v_batch, 90, 'damage', null);

  perform public.close_batch(v_batch);

  begin
    insert into public.batch_contributions (batch_id, partner_id, qty, amount_paid) values (v_batch, p_f, 1, 190);
    raise 'illegal insert to closed batch';
  exception
    when others then
      assert sqlerrm = 'BATCH_CLOSED', 'unexpected: ' || sqlerrm;
  end;

  begin
    update public.batch_contributions set amount_paid = 1 where batch_id = v_batch;
    raise 'illegal update of closed batch contribution';
  exception
    when others then
      assert sqlerrm = 'BATCH_CLOSED', 'unexpected: ' || sqlerrm;
  end;

  begin
    delete from public.sale_allocations where sale_id in (select id from public.sales where partner_id = p_su);
    raise 'hard delete of allocation must fail';
  exception
    when others then
      assert sqlerrm in ('BATCH_CLOSED','permission denied for table sale_allocations','Insufficient privilege: 7','sale_allocations'), 'unexpected: ' || sqlerrm;
  end;

  assert (select data->'summary'->>'revenue_external' is not null from public.batch_close_snapshots where batch_id = v_batch) is true, 'snapshot data missing';

  perform public.reopen_batch(v_batch);
  assert not exists (select 1 from public.batch_close_snapshots where batch_id = v_batch), 'snapshot not deleted';
  assert (select status from public.batches where id = v_batch) = 'open', 'batch not reopened';

  perform set_config(
    'request.jwt.claims',
    '{"sub":"' || (select id::text from public.profiles where role = 'patabin_admin') || '","role":"authenticated"}',
    true
  );
  perform public.close_batch(v_batch);
  perform public.reopen_batch(v_batch);
  assert (select status from public.batches where id = v_batch) = 'open', 'batch not reopened by admin';
end $$;

rollback;
