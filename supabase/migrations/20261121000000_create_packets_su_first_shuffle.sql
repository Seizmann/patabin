-- create_packets: the su_admin partner's packets are packed first (they get
-- the top sell-priority slots); every other partner's rows are shuffled
-- randomly so the initial order is never name-alphabetical.

create or replace function public.create_packets(p_payload jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_chalan uuid := (p_payload ->> 'chalan_id')::uuid;
  v_size integer := coalesce((p_payload ->> 'pcs_per_packet')::integer, (select pcs_per_packet from public.chalans where id = v_chalan));
  v_next integer;
  v_pos integer;
  v_items jsonb;
  r jsonb;
  v_left integer;
  v_take integer;
  v_packet uuid;
begin
  perform public.assert_writeable();
  if v_chalan is null or not exists (select 1 from public.chalans where id = v_chalan and status = 'open' and deleted_at is null) then
    raise exception 'CHALAN_NOT_OPEN';
  end if;
  if v_size is null or v_size <= 0 then
    raise exception 'PACK_INVALID';
  end if;
  if jsonb_typeof(p_payload -> 'items') <> 'array' or jsonb_array_length(p_payload -> 'items') = 0 then
    raise exception 'PACK_NO_ITEMS';
  end if;
  select coalesce(max(substring(code from 3)::integer), 0) into v_next
  from public.packets where chalan_id = v_chalan and code ~ '^P-\d{3,}$';
  select coalesce(max(position), 0) into v_pos from public.sell_priority;
  select coalesce(jsonb_agg(x.item order by x.grp, case when x.grp = 0 then x.ord end, x.rand), '[]'::jsonb)
  into v_items
  from (
    select
      x.item,
      case when exists (
        select 1 from public.partners p
        join public.profiles pr on pr.id = p.user_id
        where p.id = (x.item ->> 'partner_id')::uuid and pr.role = 'su_admin'
      ) then 0 else 1 end as grp,
      x.ord,
      random() as rand
    from jsonb_array_elements(p_payload -> 'items') with ordinality as x(item, ord)
  ) x;
  for r in select jsonb_array_elements(v_items) loop
    v_left := (r ->> 'pcs')::integer;
    if v_left is null or v_left <= 0
      or not exists (select 1 from public.partners where id = (r ->> 'partner_id')::uuid and deleted_at is null) then
      raise exception 'PACK_ITEM_INVALID';
    end if;
    while v_left > 0 loop
      v_take := least(v_left, v_size);
      v_next := v_next + 1;
      insert into public.packets (chalan_id, code, owner_partner_id, total_pcs, packed_at, created_by)
      values (
        v_chalan,
        'P-' || lpad(v_next::text, 3, '0'),
        (r ->> 'partner_id')::uuid,
        v_take,
        coalesce((p_payload ->> 'packed_at')::timestamptz, now()),
        auth.uid()
      ) returning id into v_packet;
      insert into public.sell_priority (packet_id, position) values (v_packet, v_pos + 1)
      on conflict (packet_id) do update set position = excluded.position;
      v_pos := v_pos + 1;
      v_left := v_left - v_take;
    end loop;
  end loop;
end $$;
