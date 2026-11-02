-- increase/decrease the chocolate pcs a partner bought in an open chalan
-- p_delta > 0: add pcs (amount_paid grows by delta * buy_rate)
-- p_delta < 0: remove pcs; what is still unpacked comes off freely, anything
--   already packed must be taken out of the packets named in p_packets
--   ([{"packet_id": "...", "qty": n}, ...]) — a packet never goes below its
--   already sold/used pcs and purchase qty/amount_paid never go negative
create or replace function public.adjust_chalan_purchase(
  p_chalan_id uuid,
  p_partner_id uuid,
  p_delta integer,
  p_packets jsonb default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_status text;
  v_rate numeric;
  v_qty integer;
  v_amount_paid numeric;
  v_packed integer;
  v_unpacked integer;
  v_cut integer;
  v_from_packed integer;
  v_need integer;
  v_rem numeric;
  v_sum integer := 0;
  r jsonb;
begin
  perform public.assert_writeable();

  select status, buy_rate into v_status, v_rate
  from public.chalans
  where id = p_chalan_id and deleted_at is null;
  if v_status is null then
    raise exception 'CHALAN_NOT_FOUND';
  end if;
  if v_status <> 'open' then
    raise exception 'CHALAN_NOT_OPEN';
  end if;
  if not exists (select 1 from public.partners where id = p_partner_id and deleted_at is null) then
    raise exception 'CHALAN_ITEM_INVALID';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'CHALAN_ADJUST_INVALID';
  end if;

  select qty, amount_paid into v_qty, v_amount_paid
  from public.chalan_purchases
  where chalan_id = p_chalan_id and partner_id = p_partner_id and deleted_at is null;

  if p_delta > 0 then
    if v_qty is null then
      insert into public.chalan_purchases (chalan_id, partner_id, qty, amount_paid, created_by)
      values (p_chalan_id, p_partner_id, p_delta, round(p_delta * v_rate, 2), auth.uid());
    else
      update public.chalan_purchases
      set qty = qty + p_delta,
          amount_paid = amount_paid + round(p_delta * v_rate, 2),
          updated_at = now()
      where chalan_id = p_chalan_id and partner_id = p_partner_id and deleted_at is null;
    end if;
    return;
  end if;

  v_cut := -p_delta;
  if v_qty is null or v_cut > v_qty then
    raise exception 'CHALAN_ADJUST_TOO_BIG';
  end if;

  select coalesce(sum(total_pcs), 0) into v_packed
  from public.packets
  where chalan_id = p_chalan_id and owner_partner_id = p_partner_id and deleted_at is null;

  v_unpacked := v_qty - v_packed;
  v_from_packed := v_cut - greatest(v_unpacked, 0);

  if v_from_packed > 0 then
    if jsonb_typeof(p_packets) <> 'array' or jsonb_array_length(p_packets) = 0 then
      raise exception 'CHALAN_ADJUST_NEEDS_PACKETS';
    end if;
    for r in select jsonb_array_elements(p_packets) loop
      v_need := (r ->> 'qty')::integer;
      if v_need is null or v_need <= 0 then
        raise exception 'CHALAN_ADJUST_INVALID';
      end if;
      select public.packet_remaining(pk.id) into v_rem
      from public.packets pk
      where pk.id = (r ->> 'packet_id')::uuid
        and pk.chalan_id = p_chalan_id
        and pk.owner_partner_id = p_partner_id
        and pk.deleted_at is null;
      if v_rem is null then
        raise exception 'CHALAN_ADJUST_PACKET_INVALID';
      end if;
      if v_need > v_rem then
        raise exception 'CHALAN_ADJUST_PACKET_OVER';
      end if;
      update public.packets
      set total_pcs = total_pcs - v_need,
          updated_at = now()
      where id = (r ->> 'packet_id')::uuid;
      v_sum := v_sum + v_need;
    end loop;
    if v_sum <> v_from_packed then
      raise exception 'CHALAN_ADJUST_PACKET_MISMATCH';
    end if;
  end if;

  update public.chalan_purchases
  set qty = qty - v_cut,
      amount_paid = greatest(amount_paid - round(v_cut * v_rate, 2), 0),
      updated_at = now()
  where chalan_id = p_chalan_id and partner_id = p_partner_id and deleted_at is null;
end $$;

grant execute on function public.adjust_chalan_purchase(uuid, uuid, integer, jsonb) to authenticated;
