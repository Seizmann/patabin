create extension if not exists pgcrypto with schema extensions;

create or replace function public.agent_snapshot() returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'packets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'packet_id', s.packet_id, 'code', s.packet_code, 'owner_partner_id', s.owner_partner_id,
        'remaining', s.remaining
      ) order by s.packet_code)
      from public.v_packet_stock s
      where s.chalan_status = 'open'
    ), '[]'::jsonb),
    'wallets', coalesce((
      select jsonb_agg(jsonb_build_object('wallet_id', s.wallet_id, 'balance', s.balance) order by s.wallet_id)
      from public.v_wallet_balance s
    ), '[]'::jsonb),
    'partners', coalesce((
      select jsonb_agg(jsonb_build_object('partner_id', s.partner_id, 'balance', s.balance) order by s.partner_id)
      from public.v_partner_balance s
    ), '[]'::jsonb)
  )
$$;

create or replace function public.agent_hash(p_data jsonb) returns text
language sql stable security definer set search_path = public, extensions
as $$
  select encode(extensions.digest(p_data::text::bytea, 'sha256'), 'hex')
$$;

create or replace function public.agent_preview_action(p_tool text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_detail jsonb;
  v_id uuid;
  v_time_key text;
begin
  perform public.agent_assert_allowed();
  case p_tool
    when 'propose_sale' then v_time_key := 'sold_at';
    when 'propose_expense' then v_time_key := 'spent_at';
    when 'propose_personal_use' then v_time_key := 'at';
    when 'propose_adjustment' then v_time_key := 'at';
    else raise exception 'AGENT_UNKNOWN_TOOL';
  end case;

  v_before := public.agent_snapshot();
  begin
    case p_tool
      when 'propose_sale' then v_id := public.create_sale(p_payload);
      when 'propose_expense' then v_id := public.create_expense(p_payload);
      when 'propose_personal_use' then v_id := public.create_personal_use(p_payload);
      when 'propose_adjustment' then v_id := public.create_adjustment(p_payload);
    end case;
    if p_tool = 'propose_sale' then
      v_detail := jsonb_build_object(
        'allocations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'packet_id', a.packet_id, 'packet_code', p.code, 'owner_name', pn.name, 'qty', a.qty
          ) order by a.qty desc)
          from public.sale_allocations a
          join public.packets p on p.id = a.packet_id
          join public.partners pn on pn.id = p.owner_partner_id
          where a.sale_id = v_id
        ), '[]'::jsonb),
        'receives', coalesce((
          select jsonb_agg(jsonb_build_object('wallet_id', sr.wallet_account_id, 'label', w.label, 'amount', sr.amount) order by w.label)
          from public.sale_receives sr
          join public.wallets w on w.id = sr.wallet_account_id
          where sr.sale_id = v_id
        ), '[]'::jsonb)
      );
    else
      v_detail := '{}'::jsonb;
    end if;
    v_after := public.agent_snapshot();
    raise exception 'preview rollback' using errcode = 'PB001';
  exception
    when others then
      if sqlstate = 'PB001' then
        return jsonb_build_object(
          'ok', true, 'result_id', v_id, 'detail', v_detail,
          'before', v_before, 'after', v_after,
          'deltas', public.agent_deltas(v_before, v_after)
        );
      end if;
      return jsonb_build_object('ok', false, 'error', sqlerrm, 'code', sqlstate);
  end;
end $$;

create or replace function public.agent_deltas(p_before jsonb, p_after jsonb)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'wallets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'wallet_id', a ->> 'wallet_id',
        'balance', (a ->> 'balance')::numeric,
        'delta', ((a ->> 'balance')::numeric - coalesce((select (b ->> 'balance')::numeric from jsonb_array_elements(p_before -> 'wallets') b where b ->> 'wallet_id' = a ->> 'wallet_id'), 0))
      )), '[]'::jsonb)
      from jsonb_array_elements(p_after -> 'wallets') a
    ),
    'partners', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'partner_id', a ->> 'partner_id',
        'balance', (a ->> 'balance')::numeric,
        'delta', ((a ->> 'balance')::numeric - coalesce((select (b ->> 'balance')::numeric from jsonb_array_elements(p_before -> 'partners') b where b ->> 'partner_id' = a ->> 'partner_id'), 0))
      )), '[]'::jsonb)
      from jsonb_array_elements(p_after -> 'partners') a
    ),
    'packets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'packet_id', a ->> 'packet_id',
        'remaining', (a ->> 'remaining')::integer,
        'delta', ((a ->> 'remaining')::integer - coalesce((select (b ->> 'remaining')::integer from jsonb_array_elements(p_before -> 'packets') b where b ->> 'packet_id' = a ->> 'packet_id'), 0))
      )), '[]'::jsonb)
      from jsonb_array_elements(p_after -> 'packets') a
    )
  )
$$;

create or replace function public.agent_fix_payload(p_tool text, p_payload jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_time_key text;
begin
  v_time_key := case p_tool
    when 'propose_sale' then 'sold_at'
    when 'propose_expense' then 'spent_at'
    else 'at'
  end;
  if p_payload -> v_time_key is null then
    return jsonb_set(p_payload, ARRAY[v_time_key], to_jsonb(now()));
  end if;
  return p_payload;
end $$;

create or replace function public.agent_create_action(
  p_conversation_id uuid,
  p_message_id uuid,
  p_tool text,
  p_payload jsonb,
  p_defaults_used text[],
  p_model_id text
)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_payload jsonb;
  v_preview jsonb;
  v_preview_data jsonb;
  v_action_id uuid;
begin
  perform public.agent_assert_allowed();
  if p_model_id is null or length(p_model_id) = 0 then
    raise exception 'AGENT_MODEL_REQUIRED';
  end if;
  if p_conversation_id is not null and not exists (
    select 1 from public.agent_conversations
    where id = p_conversation_id and owner_id = auth.uid()
  ) then
    raise exception 'AGENT_CONVERSATION_NOT_FOUND';
  end if;
  if p_message_id is not null and not exists (
    select 1 from public.agent_messages
    where id = p_message_id and conversation_id is not distinct from p_conversation_id
  ) then
    raise exception 'AGENT_MESSAGE_NOT_FOUND';
  end if;

  v_payload := public.agent_fix_payload(p_tool, p_payload);
  v_preview := public.agent_preview_action(p_tool, v_payload);
  if v_preview ->> 'ok' is distinct from 'true' then
    return v_preview;
  end if;
  v_preview_data := v_preview - 'result_id';

  insert into public.agent_pending_actions (
    conversation_id, message_id, tool, payload, defaults_used,
    preview, payload_hash, preview_hash, status, model_id, expires_at
  ) values (
    p_conversation_id, p_message_id, p_tool, v_payload, coalesce(p_defaults_used, '{}'),
    v_preview_data, public.agent_hash(v_payload), public.agent_hash(v_preview_data),
    'pending', p_model_id, now() + interval '30 minutes'
  ) returning id into v_action_id;

  return jsonb_build_object(
    'ok', true, 'action_id', v_action_id, 'status', 'pending',
    'payload_hash', public.agent_hash(v_payload), 'preview_hash', public.agent_hash(v_preview_data),
    'expires_at', (select to_char(expires_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from public.agent_pending_actions where id = v_action_id)
  );
end $$;

create or replace function public.agent_approve_action(p_action_id uuid, p_expected_preview_hash text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_tool text;
  v_payload jsonb;
  v_model_id text;
  v_status text;
  v_preview_hash text;
  v_preview jsonb;
  v_preview_data jsonb;
  v_result_id uuid;
  v_result_table text;
begin
  perform public.agent_assert_allowed();
  select tool, payload, model_id, status, preview_hash, result_table, result_id
    into v_tool, v_payload, v_model_id, v_status, v_preview_hash, v_result_table, v_result_id
  from public.agent_pending_actions
  where id = p_action_id
  for update;
  if not found then
    raise exception 'AGENT_ACTION_NOT_FOUND';
  end if;

  if v_status = 'executed' then
    return jsonb_build_object('status', 'executed', 'result_table', v_result_table, 'result_id', v_result_id);
  end if;

  if v_status <> 'pending' then
    return jsonb_build_object('status', v_status);
  end if;

  if exists (select 1 from public.agent_pending_actions where id = p_action_id and expires_at < now()) then
    update public.agent_pending_actions
      set status = 'expired', decided_at = now(), decided_by = auth.uid()
    where id = p_action_id;
    return jsonb_build_object('status', 'expired');
  end if;

  v_preview := public.agent_preview_action(v_tool, v_payload);
  if v_preview ->> 'ok' is distinct from 'true' then
    update public.agent_pending_actions
      set status = 'failed', error = v_preview ->> 'error', decided_at = now(), decided_by = auth.uid()
    where id = p_action_id;
    return jsonb_build_object('status', 'failed', 'error', v_preview ->> 'error');
  end if;
  v_preview_data := v_preview - 'result_id';

  if public.agent_hash(v_preview_data) <> v_preview_hash
    or p_expected_preview_hash is distinct from v_preview_hash then
    update public.agent_pending_actions
      set status = 'stale', preview = v_preview_data, decided_at = now(), decided_by = auth.uid()
    where id = p_action_id;
    return jsonb_build_object('status', 'stale', 'preview', v_preview_data);
  end if;

  begin
    perform set_config('patabin.agent_exec', 'on', true);
    case v_tool
      when 'propose_sale' then
        v_result_id := public.create_sale(v_payload);
        v_result_table := 'sales';
      when 'propose_expense' then
        v_result_id := public.create_expense(v_payload);
        v_result_table := 'expenses';
      when 'propose_personal_use' then
        v_result_id := public.create_personal_use(v_payload);
        v_result_table := 'personal_uses';
      when 'propose_adjustment' then
        v_result_id := public.create_adjustment(v_payload);
        v_result_table := 'stock_adjustments';
    end case;
    execute format(
      'update public.%I set source = %L, agent_model = %L, pending_action_id = %L where id = %L',
      v_result_table, 'agent', v_model_id, p_action_id, v_result_id
    );
  exception
    when others then
      perform set_config('patabin.agent_exec', 'off', true);
      update public.agent_pending_actions
        set status = 'failed', error = sqlerrm, decided_at = now(), decided_by = auth.uid()
      where id = p_action_id;
      return jsonb_build_object('status', 'failed', 'error', sqlerrm);
  end;
  perform set_config('patabin.agent_exec', 'off', true);

  update public.agent_pending_actions
    set status = 'executed', result_table = v_result_table, result_id = v_result_id,
        preview = v_preview_data, decided_at = now(), decided_by = auth.uid()
  where id = p_action_id;

  return jsonb_build_object('status', 'executed', 'result_table', v_result_table, 'result_id', v_result_id);
end $$;

create or replace function public.agent_reject_action(p_action_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_status text;
begin
  perform public.agent_assert_allowed();
  select status into v_status from public.agent_pending_actions where id = p_action_id for update;
  if not found then
    raise exception 'AGENT_ACTION_NOT_FOUND';
  end if;
  if v_status = 'pending' then
    update public.agent_pending_actions
      set status = 'rejected', decided_at = now(), decided_by = auth.uid()
    where id = p_action_id;
    return jsonb_build_object('status', 'rejected');
  end if;
  return jsonb_build_object('status', v_status);
end $$;

create or replace function public.agent_purge_history_impl()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
begin
  with deleted as (
    delete from public.agent_conversations
    where last_activity_at < now() - interval '90 days'
    returning 1
  )
  select count(*) into v_count from deleted;
  return v_count;
end $$;

create or replace function public.agent_purge_history()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
begin
  perform public.agent_assert_allowed();
  v_count := public.agent_purge_history_impl();
  return v_count;
end $$;

revoke execute on function public.agent_purge_history_impl() from public, anon, authenticated;

revoke execute on function public.agent_snapshot() from public, anon, authenticated;
revoke execute on function public.agent_hash(jsonb) from public, anon, authenticated;
revoke execute on function public.agent_deltas(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.agent_fix_payload(text, jsonb) from public, anon, authenticated;
revoke execute on function public.agent_preview_action(text, jsonb) from public, anon, authenticated;
revoke execute on function public.agent_create_action(uuid, uuid, text, jsonb, text[], text) from public, anon, authenticated;
revoke execute on function public.agent_approve_action(uuid, text) from public, anon, authenticated;
revoke execute on function public.agent_reject_action(uuid) from public, anon, authenticated;
revoke execute on function public.agent_purge_history() from public, anon, authenticated;

grant execute on function public.agent_preview_action(text, jsonb) to authenticated;
grant execute on function public.agent_create_action(uuid, uuid, text, jsonb, text[], text) to authenticated;
grant execute on function public.agent_approve_action(uuid, text) to authenticated;
grant execute on function public.agent_reject_action(uuid) to authenticated;
grant execute on function public.agent_purge_history() to authenticated;
