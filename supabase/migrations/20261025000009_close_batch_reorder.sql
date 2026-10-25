create or replace function public.close_batch(p_batch_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_remaining numeric;
  v_summary record;
  v_partners jsonb;
begin
  perform public.assert_writeable();
  select remaining into v_remaining from public.v_batch_stock where batch_id = p_batch_id;
  if v_remaining is null then
    raise exception 'BATCH_NOT_FOUND';
  end if;
  if v_remaining <> 0 then
    raise exception 'STOCK_LEFT';
  end if;
  select * into v_summary from public.v_batch_summary where batch_id = p_batch_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'partner_id', pv.partner_id,
    'partner_name', pv.partner_name,
    'contribution', pv.contribution,
    'contribution_share', pv.contribution_share,
    'personal_value', pv.personal_value,
    'payout', pv.payout
  )), '[]'::jsonb) into v_partners
  from public.v_partner_batch_payout pv
  where pv.batch_id = p_batch_id;
  update public.batches set status = 'closed', closed_at = now(), closed_by = auth.uid() where id = p_batch_id and status = 'open';
  if not found then
    raise exception 'BATCH_ALREADY_CLOSED';
  end if;
  insert into public.batch_close_snapshots (batch_id, closed_at, closed_by, data)
  values (p_batch_id, now(), auth.uid(), jsonb_build_object(
    'summary', to_jsonb(v_summary),
    'partners', v_partners
  ))
  on conflict (batch_id) do update set closed_at = excluded.closed_at, closed_by = excluded.closed_by, data = excluded.data;
end $$;
