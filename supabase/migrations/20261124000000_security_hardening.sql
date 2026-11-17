create or replace function public.income_by_period_breakdown(p_start timestamptz, p_end timestamptz)
returns table (
  slice text,
  amount numeric
)
language plpgsql stable security definer set search_path = public, extensions
as $$
begin
  if not coalesce(public.is_active_user(), false) then
    raise exception 'NOT_ACTIVE';
  end if;
  return query
  select coalesce(w.type, 'unknown') || '|' || coalesce(w.label, '') as slice, coalesce(sum(s.amount_received), 0) as amount
  from public.sales s
  join public.wallets w on w.id = s.wallet_account_id
  where s.deleted_at is null and s.sold_at >= p_start and s.sold_at < p_end
  group by coalesce(w.type, 'unknown'), coalesce(w.label, '')
  union all
  select 'personal' as slice, coalesce(sum(pu.qty * pu.unit_value), 0) as amount
  from public.personal_uses pu
  where pu.deleted_at is null and pu.at >= p_start and pu.at < p_end
  having coalesce(sum(pu.qty * pu.unit_value), 0) <> 0;
end $$;

create or replace function public.partner_sell_summary(p_start timestamptz, p_end timestamptz)
returns table (partner_id uuid, partner_name text, sell_revenue numeric, personal_use numeric, khoroch numeric, remaining_pcs bigint, balance numeric)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not coalesce(public.is_active_user(), false) then
    raise exception 'NOT_ACTIVE';
  end if;
  return query
  with sett as (
    select s.partner_id,
           sum(s.ext_rev) as sell,
           sum(s.consumption_due - s.internal_rev) as personal,
           sum(s.expenses_attributed - s.pocket_paid) as khoroch
    from public.v_partner_chalan_settlement s
    join public.chalans c on c.id = s.chalan_id
    where c.deleted_at is null
      and c.purchase_date >= p_start and c.purchase_date < p_end
    group by 1
  ),
  stock as (
    select pk.owner_partner_id as partner_id,
           sum(coalesce(public.packet_remaining(pk.id), 0)) as pcs
    from public.packets pk
    join public.chalans c on c.id = pk.chalan_id
    where pk.deleted_at is null and c.deleted_at is null and c.status = 'open'
      and c.purchase_date >= p_start and c.purchase_date < p_end
    group by 1
  )
  select p.id,
         p.name,
         coalesce(st.sell, 0) as sell_revenue,
         coalesce(st.personal, 0) as personal_use,
         coalesce(st.khoroch, 0) as khoroch,
         coalesce(so.pcs, 0) as remaining_pcs,
         coalesce(st.sell, 0) - coalesce(st.personal, 0) - coalesce(st.khoroch, 0) as balance
  from public.partners p
  left join sett st on st.partner_id = p.id
  left join stock so on so.partner_id = p.id
  where coalesce(st.sell, 0) <> 0 or coalesce(st.personal, 0) <> 0
      or coalesce(st.khoroch, 0) <> 0 or coalesce(so.pcs, 0) <> 0;
end $$;

create or replace function public.wallet_flows(p_start timestamptz, p_end timestamptz)
returns table (wallet_id uuid, type text, name text, label text, is_active boolean, amount numeric)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not coalesce(public.is_active_user(), false) then
    raise exception 'NOT_ACTIVE';
  end if;
  return query
  select
    w.id,
    w.type,
    w.name,
    w.label,
    w.is_active,
    coalesce((select sum(sr.amount) from public.sale_receives sr join public.sales s on s.id = sr.sale_id
      where sr.wallet_account_id = w.id and s.deleted_at is null and s.sold_at >= p_start and s.sold_at < p_end), 0)
    + coalesce((select sum(p.amount) from public.customer_payments p
      where p.wallet_account_id = w.id and p.deleted_at is null and p.at >= p_start and p.at < p_end), 0)
    - coalesce((select sum(e.amount) from public.expenses e
      where e.wallet_account_id = w.id and e.deleted_at is null and e.spent_at >= p_start and e.spent_at < p_end), 0)
    - coalesce((select sum(wd.amount) from public.withdrawals wd
      where wd.wallet_account_id = w.id and wd.deleted_at is null and wd.at >= p_start and wd.at < p_end), 0)
    - coalesce((select sum(t.amount) from public.wallet_transfers t
      where t.from_wallet_id = w.id and t.deleted_at is null and t.at >= p_start and t.at < p_end), 0)
    + coalesce((select sum(t.amount - t.charge) from public.wallet_transfers t
      where t.to_wallet_id = w.id and t.deleted_at is null and t.at >= p_start and t.at < p_end), 0) as amount
  from public.wallets w
  where w.type = 'cash' or w.is_active
  order by w.type, w.created_at;
end $$;

create or replace function public.partner_balance_flows(p_start timestamptz, p_end timestamptz)
returns table (partner_id uuid, partner_name text, balance numeric)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not coalesce(public.is_active_user(), false) then
    raise exception 'NOT_ACTIVE';
  end if;
  return query
  with live as (
    select s.partner_id, sum(s.entitlement) as amt
    from public.v_partner_chalan_settlement s
    join public.chalans c on c.id = s.chalan_id
    where c.status = 'open' and c.deleted_at is null
      and c.purchase_date >= p_start and c.purchase_date < p_end
    group by 1
  ), closed as (
    select (el.value ->> 'partner_id')::uuid as partner_id,
           sum((el.value ->> 'entitlement')::numeric(12,2)) as amt
    from public.chalan_close_snapshots cs
    join public.chalans c on c.id = cs.chalan_id and c.deleted_at is null
      and c.purchase_date >= p_start and c.purchase_date < p_end
    cross join lateral jsonb_array_elements(cs.data -> 'partners') el(value)
    group by 1
  ), charges as (
    select wt.attributed_to_partner_id as partner_id, sum(wt.charge) as amt
    from public.wallet_transfers wt
    where wt.deleted_at is null and wt.at >= p_start and wt.at < p_end
    group by 1
  ), unlinked_exp as (
    select e.attributed_to_partner_id as partner_id, sum(e.amount) as amt
    from public.expenses e
    where e.deleted_at is null and e.chalan_id is null
      and e.spent_at >= p_start and e.spent_at < p_end
    group by 1
  ), unlinked_pocket as (
    select e.paid_by_partner_id as partner_id, sum(e.amount) as amt
    from public.expenses e
    where e.deleted_at is null and e.chalan_id is null and e.wallet_account_id is null
      and e.spent_at >= p_start and e.spent_at < p_end
    group by 1
  ), taken as (
    select wd.partner_id, sum(wd.amount) as amt
    from public.withdrawals wd
    where wd.deleted_at is null and wd.at >= p_start and wd.at < p_end
    group by 1
  )
  select p.id,
         p.name,
         coalesce(li.amt, 0) + coalesce(cl.amt, 0) - coalesce(ch.amt, 0)
         - coalesce(ux.amt, 0) + coalesce(uk.amt, 0) - coalesce(tk.amt, 0) as balance
  from public.partners p
  left join live li on li.partner_id = p.id
  left join closed cl on cl.partner_id = p.id
  left join charges ch on ch.partner_id = p.id
  left join unlinked_exp ux on ux.partner_id = p.id
  left join unlinked_pocket uk on uk.partner_id = p.id
  left join taken tk on tk.partner_id = p.id
  where coalesce(li.amt, 0) + coalesce(cl.amt, 0) - coalesce(ch.amt, 0)
        - coalesce(ux.amt, 0) + coalesce(uk.amt, 0) - coalesce(tk.amt, 0) <> 0;
end $$;

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
  perform public.assert_writeable('packets');
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

alter table public.permissions force row level security;
alter table public.role_permissions force row level security;
alter table public.profile_permissions force row level security;

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() and can_write()) with check (id = auth.uid() and can_write());

revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

create or replace function public.guard_profiles() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_is_su boolean;
begin
  if v_caller is null then
    if old.role = 'su_admin' and old.is_active and not new.is_active then
      if not exists (select 1 from public.profiles where role = 'su_admin' and is_active and id <> old.id) then
        raise exception 'LAST_SU_ADMIN';
      end if;
    end if;
    return new;
  end if;
  v_caller_is_su := exists (select 1 from public.profiles where id = v_caller and role = 'su_admin' and is_active);
  if v_caller = new.id and new.role is distinct from old.role then
    raise exception 'SELF_ROLE_CHANGE';
  end if;
  if ('su_admin'::text in (old.role::text, new.role::text)) and not v_caller_is_su then
    raise exception 'SU_ADMIN_PROTECTED';
  end if;
  if old.role = 'su_admin' and old.is_active and not new.is_active then
    if not exists (select 1 from public.profiles where role = 'su_admin' and is_active and id <> old.id) then
      raise exception 'LAST_SU_ADMIN';
    end if;
  end if;
  return new;
end $$;
