begin;
set local session_replication_role = replica;
delete from public.agent_messages;
delete from public.agent_pending_actions;
delete from public.agent_conversations;
delete from public.agent_models;
delete from public.agent_providers;
delete from public.chalan_close_snapshots;
delete from public.wallet_transfers;
delete from public.withdrawals;
delete from public.expenses;
delete from public.stock_adjustments;
delete from public.personal_uses;
delete from public.sale_allocations;
delete from public.customer_payment_allocations;
delete from public.customer_payments;
delete from public.sale_receives;
delete from public.sales;
delete from public.sell_priority;
delete from public.packets;
delete from public.chalan_purchases;
delete from public.chalans;
set local session_replication_role = DEFAULT;
update public.profiles set must_change_password = false;
update public.profiles set role = 'patabin_admin'
where not exists (select 1 from public.profiles where role = 'patabin_admin')
  and id = coalesce(
    (select user_id from public.partners where name = 'Bappy' and user_id is not null limit 1),
    (select user_id from public.partners where user_id is not null limit 1));
delete from public.profile_permissions
where profile_id in (select id from public.profiles where role = 'patabin_admin');

set local role anon;
do $$
begin
  assert not has_table_privilege('anon', 'public.agent_providers', 'select'), 'anon must not select agent_providers';
  assert not has_table_privilege('anon', 'public.agent_pending_actions', 'select'), 'anon must not select agent_pending_actions';
  assert not has_function_privilege('anon', 'public.agent_get_provider_key(uuid)', 'execute'), 'anon must not execute key rpc';
  assert not has_function_privilege('anon', 'public.agent_approve_action(uuid, text)', 'execute'), 'anon must not execute approve';
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"' || (select id::text from public.profiles where role = 'patabin_admin') || '","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.agent_preview_action('propose_sale', '{"qty":1}'::jsonb);
  raise 'non-su must be rejected';
exception
  when others then
    assert sqlerrm = 'AGENT_FORBIDDEN', 'expected AGENT_FORBIDDEN, got ' || sqlerrm;
end $$;
do $$
declare
  v_count integer;
begin
  assert not has_table_privilege('authenticated', 'public.agent_pending_actions', 'insert'), 'authenticated must not insert pending actions';
  perform public.agent_set_provider_key(gen_random_uuid(), 'sk-something-long');
  raise 'non-su key set must be rejected';
exception
  when others then
    assert sqlerrm = 'AGENT_FORBIDDEN', 'expected AGENT_FORBIDDEN, got ' || sqlerrm;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"' || (select id::text from public.profiles where role = 'su_admin') || '","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_provider uuid;
  v_key text;
  v_last4 text;
begin
  insert into public.agent_providers (name, base_url) values ('test-provider', 'https://api.example.com/v1')
    returning id into v_provider;

  perform public.agent_set_provider_key(v_provider, 'sk-test-1234567890');
  select key_last4 into v_last4 from public.agent_providers where id = v_provider;
  assert v_last4 = '7890', 'key_last4 ' || coalesce(v_last4, 'null');

  v_key := public.agent_get_provider_key(v_provider);
  assert v_key = 'sk-test-1234567890', 'get key mismatch';

  assert (select vault_secret_id from public.agent_providers where id = v_provider) is not null, 'vault secret missing';

  perform public.agent_set_provider_key(v_provider, 'sk-replaced-9999999');
  v_key := public.agent_get_provider_key(v_provider);
  assert v_key = 'sk-replaced-9999999', 'key replace mismatch';

  perform public.agent_clear_provider_key(v_provider);
  select vault_secret_id into v_key from public.agent_providers where id = v_provider;
  assert v_key is null, 'vault id must be cleared';
  begin
    perform public.agent_get_provider_key(v_provider);
    raise 'key get must fail after clear';
  exception
    when others then
      assert sqlerrm = 'AGENT_KEY_NOT_SET', 'expected AGENT_KEY_NOT_SET, got ' || sqlerrm;
  end;
end $$;

do $$
declare
  p_su uuid;
  p_b uuid;
  v_wallet uuid;
  v_chalan uuid;
  v_cat uuid;
  v_packet uuid;
  v_conv uuid;
  v_conv2 uuid;
  v_conv_old uuid;
  v_res jsonb;
  v_action uuid;
  v_hash text;
  v_sale uuid;
  v_stock_before integer;
  v_stock_after integer;
  v_count integer;
  v_alloc jsonb;
  v_delta numeric;
  v_id uuid;
  v_bool boolean;
  v_src text;
  v_model text;
begin
  p_su := (select id from public.partners where user_id = auth.uid());
  p_b := (select id from public.partners where user_id = (select id from public.profiles where role = 'patabin_admin'));
  select id into v_wallet from public.wallets where type = 'cash' limit 1;
  if v_wallet is null then
    insert into public.wallets (type, label) values ('cash', 'Cash') returning id into v_wallet;
  end if;
  select id into v_cat from public.expense_categories limit 1;

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

  select sum(remaining)::integer into v_stock_before from public.v_packet_stock;
  assert v_stock_before = 80, 'fixture stock ' || coalesce(v_stock_before::text, 'null');

  v_res := public.agent_preview_action('propose_sale', jsonb_build_object(
    'qty', 10, 'list_unit_price', 300, 'amount_received', 3000, 'wallet_account_id', v_wallet
  ));
  assert v_res ->> 'ok' = 'true', 'sale preview failed: ' || coalesce(v_res ->> 'error', 'null');
  assert (select count(*) from public.sales) = 0, 'sale preview must leave no rows';
  assert (select sum(remaining)::integer from public.v_packet_stock) = 80, 'sale preview must not change stock';
  v_alloc := v_res -> 'detail' -> 'allocations';
  assert (select coalesce(sum((a ->> 'qty')::numeric), 0) from jsonb_array_elements(v_alloc) a) = 10, 'preview allocations must sum to qty';

  v_res := public.agent_preview_action('propose_sale', jsonb_build_object(
    'qty', 1000, 'list_unit_price', 300, 'amount_received', 300000, 'wallet_account_id', v_wallet
  ));
  assert v_res ->> 'ok' = 'false', 'NO_STOCK preview must fail';
  assert v_res ->> 'error' = 'NO_STOCK', 'expected NO_STOCK, got ' || coalesce(v_res ->> 'error', 'null');

  v_res := public.agent_preview_action('propose_expense', jsonb_build_object(
    'category_id', v_cat, 'amount', 100, 'paid_by_partner_id', p_su,
    'attributed_to_partner_id', p_b, 'wallet_account_id', to_jsonb(null::uuid)
  ));
  assert v_res ->> 'ok' = 'true', 'expense preview failed: ' || coalesce(v_res ->> 'error', 'null');
  assert (select count(*) from public.expenses) = 0, 'expense preview must leave no rows';

  v_res := public.agent_preview_action('propose_adjustment', jsonb_build_object(
    'qty', 2, 'reason', 'gift', 'packet_id', (select packet_id from public.v_packet_stock order by packet_code limit 1)
  ));
  assert v_res ->> 'ok' = 'true', 'adjustment preview failed: ' || coalesce(v_res ->> 'error', 'null');
  assert (select count(*) from public.stock_adjustments) = 0, 'adjustment preview must leave no rows';

  insert into public.agent_conversations (title) values ('test conversation') returning id into v_conv;

  v_res := public.agent_create_action(v_conv, null, 'propose_sale', jsonb_build_object(
    'qty', 10, 'list_unit_price', 300, 'amount_received', 2900,
    'wallet_account_id', v_wallet, 'customer_name', 'Preview Customer'
  ), array['amount_received', 'sold_at'], 'test-model');
  assert v_res ->> 'ok' = 'true', 'create action failed: ' || coalesce(v_res ->> 'error', 'null');
  v_action := (v_res ->> 'action_id')::uuid;
  v_hash := v_res ->> 'preview_hash';

  select (payload ->> 'sold_at') is not null into v_bool from public.agent_pending_actions where id = v_action;
  assert v_bool, 'sold_at must be fixed at creation';

  v_res := public.agent_approve_action(v_action, v_hash);
  assert v_res ->> 'status' = 'executed', 'approve failed: ' || coalesce(v_res ->> 'error', v_res ->> 'status', 'null');
  v_sale := (v_res ->> 'result_id')::uuid;
  assert v_sale is not null, 'result id missing';

  select source, agent_model into v_src, v_model from public.sales where id = v_sale;
  assert v_src = 'agent', 'sale source ' || coalesce(v_src, 'null');
  assert v_model = 'test-model', 'sale agent_model ' || coalesce(v_model, 'null');
  select pending_action_id is not null into v_bool from public.sales where id = v_sale;
  assert v_bool, 'pending_action_id missing';

  select sum(remaining)::integer into v_stock_after from public.v_packet_stock;
  assert v_stock_after = 70, 'stock after approve ' || v_stock_after::text;
  select balance into v_delta from public.v_wallet_balance where type = 'cash';
  assert v_delta = 2900, 'wallet after approve ' || coalesce(v_delta::text, 'null');

  select count(*) into v_count from public.sale_allocations where sale_id = v_sale;
  assert v_count > 0, 'allocations missing after approve';
  select coalesce(sum(qty), 0)::integer into v_count from public.sale_allocations where sale_id = v_sale;
  assert v_count = 10, 'allocation sum ' || v_count::text;

  select count(*) into v_count from public.audit_log
  where table_name = 'sales' and row_id = v_sale and new_data ->> 'source' = 'agent' and new_data ->> 'agent_model' = 'test-model';
  assert v_count > 0, 'audit log missing agent marker';

  v_res := public.agent_approve_action(v_action, v_hash);
  assert v_res ->> 'status' = 'executed', 'second approve must be idempotent';
  select count(*) into v_count from public.sales where pending_action_id = v_action;
  assert v_count = 1, 'duplicate sale from idempotent approve';

  begin
    insert into public.stock_adjustments (at, packet_id, qty, reason, source)
    values (now(), (select packet_id from public.v_packet_stock order by packet_code limit 1), 1, 'gift', 'agent');
    raise 'direct agent insert must fail';
  exception
    when others then
      assert sqlerrm = 'AGENT_EXEC_OFF', 'expected AGENT_EXEC_OFF, got ' || sqlerrm;
  end;

  perform set_config('patabin.agent_exec', 'on', true);
  begin
    insert into public.stock_adjustments (at, packet_id, qty, reason, source, agent_model)
    values (now(), (select packet_id from public.v_packet_stock order by packet_code limit 1), 1, 'gift', 'agent', 'test-model');
    raise 'incomplete agent insert must fail';
  exception
    when others then
      assert sqlerrm = 'AGENT_MARK_INCOMPLETE', 'expected AGENT_MARK_INCOMPLETE, got ' || sqlerrm;
  end;
  perform set_config('patabin.agent_exec', 'off', true);

  v_res := public.agent_create_action(v_conv, null, 'propose_sale', jsonb_build_object(
    'qty', 5, 'list_unit_price', 300, 'amount_received', 1500, 'wallet_account_id', v_wallet
  ), '{}'::text[], 'test-model');
  assert v_res ->> 'ok' = 'true', 'stale action create failed';
  v_action := (v_res ->> 'action_id')::uuid;
  v_hash := v_res ->> 'preview_hash';
  perform public.create_sale(jsonb_build_object(
    'qty', 5, 'list_unit_price', 300, 'amount_received', 1500, 'wallet_account_id', v_wallet
  ));
  v_res := public.agent_approve_action(v_action, v_hash);
  assert v_res ->> 'status' = 'stale', 'expected stale, got ' || coalesce(v_res ->> 'status', 'null');
  select count(*) into v_count from public.sales where pending_action_id = v_action;
  assert v_count = 0, 'stale action must not execute';

  v_res := public.agent_create_action(v_conv, null, 'propose_expense', jsonb_build_object(
    'category_id', v_cat, 'amount', 100, 'paid_by_partner_id', p_su, 'attributed_to_partner_id', p_b
  ), '{}'::text[], 'test-model');
  v_action := (v_res ->> 'action_id')::uuid;
  v_hash := v_res ->> 'preview_hash';
  execute 'reset role';
  update public.agent_pending_actions set expires_at = now() - interval '1 minute' where id = v_action;
  perform set_config('request.jwt.claims', '{"sub":"' || (select id::text from public.profiles where role = 'su_admin') || '","role":"authenticated"}', true);
  execute 'set local role authenticated';
  v_res := public.agent_approve_action(v_action, v_hash);
  assert v_res ->> 'status' = 'expired', 'expected expired, got ' || coalesce(v_res ->> 'status', 'null');
  select count(*) into v_count from public.expenses where pending_action_id = v_action;
  assert v_count = 0, 'expired action must not execute';

  v_res := public.agent_create_action(v_conv, null, 'propose_sale', jsonb_build_object(
    'qty', 10, 'list_unit_price', 300, 'amount_received', 3000, 'wallet_account_id', v_wallet
  ), '{}'::text[], 'test-model');
  assert v_res ->> 'ok' = 'true', 'spanning sale create failed';
  v_action := (v_res ->> 'action_id')::uuid;
  v_hash := v_res ->> 'preview_hash';
  select preview -> 'detail' -> 'allocations' into v_alloc
    from public.agent_pending_actions where id = v_action;
  assert v_alloc is not null and jsonb_typeof(v_alloc) = 'array', 'spanning sale preview must carry allocations';
  assert (select count(*) from jsonb_array_elements(v_alloc) a) >= 2, 'spanning sale must touch several packets';
  v_res := public.agent_approve_action(v_action, v_hash);
  assert v_res ->> 'status' = 'executed', 'spanning sale approve failed: ' || coalesce(v_res ->> 'error', 'null');
  v_sale := (v_res ->> 'result_id')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object('packet_id', a.packet_id, 'qty', a.qty) order by a.qty desc), '[]'::jsonb)
    into v_alloc from public.sale_allocations a where a.sale_id = v_sale;
  assert (
    select count(*) from jsonb_array_elements(v_alloc) a
    where not exists (
      select 1 from jsonb_array_elements(
        (select preview -> 'detail' -> 'allocations' from public.agent_pending_actions where id = v_action)
      ) p
      where p ->> 'packet_id' = a ->> 'packet_id' and p ->> 'qty' = a ->> 'qty'
    )
  ) = 0, 'executed allocations must match the preview rows';

  v_res := public.agent_create_action(v_conv, null, 'propose_sale', jsonb_build_object(
    'qty', 5, 'list_unit_price', 300, 'amount_received', 1500, 'wallet_account_id', v_wallet
  ), '{}'::text[], 'test-model');
  assert v_res ->> 'ok' = 'true', 'failed-approval create failed';
  v_action := (v_res ->> 'action_id')::uuid;
  v_hash := v_res ->> 'preview_hash';
  select sum(remaining)::integer into v_stock_before from public.v_packet_stock;
  assert v_stock_before = 55, 'stock before failing approval ' || coalesce(v_stock_before::text, 'null');
  execute 'reset role';
  perform public.create_sale(jsonb_build_object(
    'qty', 50, 'list_unit_price', 300, 'amount_received', 15000, 'wallet_account_id', v_wallet
  ));
  perform set_config('request.jwt.claims', '{"sub":"' || (select id::text from public.profiles where role = 'su_admin') || '","role":"authenticated"}', true);
  execute 'set local role authenticated';
  v_res := public.agent_approve_action(v_action, v_hash);
  assert v_res ->> 'status' in ('stale', 'failed'), 'stock consumed at approval must not execute, got ' || coalesce(v_res ->> 'status', 'null');
  select count(*) into v_count from public.sales where pending_action_id = v_action;
  assert v_count = 0, 'failed approval must leave no sale';

  v_res := public.agent_create_action(v_conv, null, 'propose_personal_use', jsonb_build_object(
    'eater_partner_id', p_su, 'qty', 2, 'chalan_id', v_chalan, 'unit_value', 300
  ), '{}'::text[], 'test-model');
  v_action := (v_res ->> 'action_id')::uuid;
  v_res := public.agent_reject_action(v_action);
  assert v_res ->> 'status' = 'rejected', 'reject failed';
  select count(*) into v_count from public.personal_uses where pending_action_id = v_action;
  assert v_count = 0, 'rejected action must not execute';

  insert into public.agent_conversations (title) values ('recent') returning id into v_conv2;
  insert into public.agent_conversations (title) values ('old') returning id into v_conv_old;
  update public.agent_conversations set last_activity_at = now() - interval '95 days' where id = v_conv_old;
  v_res := public.agent_create_action(v_conv_old, null, 'propose_expense', jsonb_build_object(
    'category_id', v_cat, 'amount', 50, 'paid_by_partner_id', p_su,
    'attributed_to_partner_id', p_su, 'wallet_account_id', v_wallet
  ), '{}'::text[], 'test-model');
  v_action := (v_res ->> 'action_id')::uuid;
  v_res := public.agent_approve_action(v_action, v_res ->> 'preview_hash');
  assert v_res ->> 'status' = 'executed', 'purge setup approve failed: ' || coalesce(v_res ->> 'error', 'null');

  v_count := public.agent_purge_history();
  assert v_count >= 1, 'purge must remove old conversations';
  select count(*) into v_count from public.agent_conversations where id = v_conv_old;
  assert v_count = 0, 'old conversation must be gone';
  select count(*) into v_count from public.agent_conversations where id = v_conv2;
  assert v_count = 1, 'recent conversation must stay';
  select conversation_id is null, count(*) into v_bool, v_count
    from public.agent_pending_actions where id = v_action group by 1;
  assert v_count = 1 and v_bool, 'executed action must survive purge with conversation null';

  perform public.create_sale(jsonb_build_object(
    'qty', 5, 'list_unit_price', 300, 'amount_received', 1500, 'wallet_account_id', v_wallet
  ));
  select sum(remaining)::integer into v_stock_after from public.v_packet_stock;
  assert v_stock_after = 0, 'stock before close ' || v_stock_after::text;
  perform public.close_chalan(v_chalan);

  v_res := public.agent_create_action(v_conv2, null, 'propose_adjustment', jsonb_build_object(
    'qty', 1, 'reason', 'gift', 'packet_id', (select packet_id from public.v_packet_stock order by packet_code limit 1)
  ), '{}'::text[], 'test-model');
  assert v_res ->> 'ok' = 'false', 'closed chalan action must fail preview';

  assert (select count(*) from public.v_expenses_enriched) > 0, 'expenses view must read';
  assert (select count(*) from public.v_personal_uses_enriched) >= 0, 'personal uses view must read';
  assert (select count(*) from public.v_adjustments_enriched) >= 0, 'adjustments view must read';
  assert (select count(*) from public.v_sales_agent) > 0, 'sales agent view must read';
  select count(*) into v_count from public.v_sales_agent where source = 'agent' and agent_model = 'test-model';
  assert v_count > 0, 'sales agent view must expose marker';
end $$;

reset role;
select set_config('request.jwt.claims', '{"sub":"' || (select id::text from public.profiles where role = 'patabin_admin') || '","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.agent_pending_actions) = 0, 'patabin_admin must not read pending actions';
  assert (select count(*) from public.agent_providers) = 0, 'patabin_admin must not read providers';
end $$;
reset role;

rollback;
