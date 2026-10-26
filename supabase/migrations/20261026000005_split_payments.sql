create table public.sale_receives (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  wallet_account_id uuid not null references public.wallets (id),
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

alter table public.sale_receives enable row level security;
alter table public.sale_receives force row level security;
create policy receives_select on public.sale_receives for select to authenticated using (is_active_user());

revoke all on public.sale_receives from anon, authenticated;
grant select on public.sale_receives to authenticated;

create or replace function public.create_sale(p_sale jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_qty integer := (p_sale ->> 'qty')::integer;
  v_price numeric := (p_sale ->> 'list_unit_price')::numeric;
  v_wallet uuid := (p_sale ->> 'wallet_account_id')::uuid;
  v_due numeric := coalesce((p_sale ->> 'due_amount')::numeric, 0);
  v_received numeric := (p_sale ->> 'amount_received')::numeric;
  v_sum numeric := 0;
  r jsonb;
begin
  perform public.assert_writeable();
  if v_qty is null or v_qty <= 0 or v_price is null or v_price < 0
    or v_received is null or v_received < 0 then
    raise exception 'SALE_INVALID';
  end if;
  if v_due < 0 or v_due + v_received > v_qty * v_price then
    raise exception 'SALE_INVALID';
  end if;
  if v_due > 0 and (p_sale ->> 'customer_id')::uuid is null then
    raise exception 'SALE_DUE_NEEDS_CUSTOMER';
  end if;
  if jsonb_typeof(p_sale -> 'receives') = 'array' then
    for r in select jsonb_array_elements(p_sale -> 'receives') loop
      v_sum := v_sum + coalesce((r ->> 'amount')::numeric, 0);
      if not exists (select 1 from public.wallets where id = (r ->> 'wallet_account_id')::uuid and is_active) then
        raise exception 'SALE_WALLET_INVALID';
      end if;
    end loop;
    if v_sum <> v_received then
      raise exception 'RECEIVE_SPLIT_MISMATCH';
    end if;
  elsif not exists (select 1 from public.wallets where id = v_wallet and is_active) then
    raise exception 'SALE_WALLET_INVALID';
  end if;
  insert into public.sales (sold_at, qty, list_unit_price, amount_received, due_amount, customer_id, customer_name, customer_phone, wallet_account_id, note, created_by)
  values (
    coalesce((p_sale ->> 'sold_at')::timestamptz, now()),
    v_qty, v_price, v_received, v_due,
    (p_sale ->> 'customer_id')::uuid,
    nullif(p_sale ->> 'customer_name', ''),
    nullif(p_sale ->> 'customer_phone', ''),
    v_wallet,
    nullif(p_sale ->> 'note', ''),
    auth.uid()
  ) returning id into v_id;
  if jsonb_typeof(p_sale -> 'receives') = 'array' then
    for r in select jsonb_array_elements(p_sale -> 'receives') loop
      insert into public.sale_receives (sale_id, wallet_account_id, amount, created_by)
      values (v_id, (r ->> 'wallet_account_id')::uuid, (r ->> 'amount')::numeric, auth.uid());
    end loop;
  else
    insert into public.sale_receives (sale_id, wallet_account_id, amount, created_by)
    values (v_id, v_wallet, v_received, auth.uid());
  end if;
  perform public.allocate_by_priority(v_id, v_qty);
  return v_id;
end $$;

create or replace function public.update_sale(p_id uuid, p_sale jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_old public.sales;
  v_qty integer := (p_sale ->> 'qty')::integer;
  v_due numeric := coalesce((p_sale ->> 'due_amount')::numeric, 0);
  v_received numeric := coalesce((p_sale ->> 'amount_received')::numeric, v_old.amount_received);
  v_freed numeric;
  v_avail numeric;
  v_sum numeric := 0;
  r jsonb;
begin
  perform public.assert_writeable();
  select * into v_old from public.sales where id = p_id and deleted_at is null;
  if v_old.id is null then
    raise exception 'SALE_NOT_FOUND';
  end if;
  if v_qty is null or v_qty <= 0 then
    raise exception 'SALE_INVALID';
  end if;
  if v_due < 0 or v_due + v_received > v_qty * coalesce((p_sale ->> 'list_unit_price')::numeric, v_old.list_unit_price) then
    raise exception 'SALE_INVALID';
  end if;
  if v_due > 0 and (p_sale ->> 'customer_id')::uuid is null and v_old.customer_id is null then
    raise exception 'SALE_DUE_NEEDS_CUSTOMER';
  end if;
  if jsonb_typeof(p_sale -> 'receives') = 'array' then
    for r in select jsonb_array_elements(p_sale -> 'receives') loop
      v_sum := v_sum + coalesce((r ->> 'amount')::numeric, 0);
      if not exists (select 1 from public.wallets where id = (r ->> 'wallet_account_id')::uuid and is_active) then
        raise exception 'SALE_WALLET_INVALID';
      end if;
    end loop;
    if v_sum <> v_received then
      raise exception 'RECEIVE_SPLIT_MISMATCH';
    end if;
  end if;
  if exists (
    select 1 from public.sale_allocations sa
    join public.packets pk on pk.id = sa.packet_id
    join public.chalans c on c.id = pk.chalan_id
    where sa.sale_id = p_id and (c.status = 'closed' or c.deleted_at is not null or pk.deleted_at is not null)
  ) then
    raise exception 'CHALAN_CLOSED';
  end if;
  select sum(qty) into v_freed from public.sale_allocations where sale_id = p_id;
  v_freed := coalesce(v_freed, 0);
  delete from public.sale_allocations where sale_id = p_id;
  select coalesce(sum(public.packet_remaining(pk.id)), 0) into v_avail from public.packets pk
  join public.chalans c on c.id = pk.chalan_id
  where pk.deleted_at is null and c.deleted_at is null and c.status = 'open';
  if v_qty > v_avail + v_freed then
    raise exception 'NO_STOCK';
  end if;
  update public.sales set
    sold_at = coalesce((p_sale ->> 'sold_at')::timestamptz, v_old.sold_at),
    qty = v_qty,
    list_unit_price = coalesce((p_sale ->> 'list_unit_price')::numeric, v_old.list_unit_price),
    amount_received = v_received,
    due_amount = v_due,
    customer_id = (p_sale ->> 'customer_id')::uuid,
    customer_name = nullif(p_sale ->> 'customer_name', ''),
    customer_phone = nullif(p_sale ->> 'customer_phone', ''),
    wallet_account_id = coalesce(v_old.wallet_account_id, (select wallet_account_id from public.sale_receives where sale_id = p_id limit 1)),
    note = nullif(p_sale ->> 'note', '')
  where id = p_id;
  delete from public.sale_receives where sale_id = p_id;
  if jsonb_typeof(p_sale -> 'receives') = 'array' then
    for r in select jsonb_array_elements(p_sale -> 'receives') loop
      insert into public.sale_receives (sale_id, wallet_account_id, amount, created_by)
      values (p_id, (r ->> 'wallet_account_id')::uuid, (r ->> 'amount')::numeric, auth.uid());
    end loop;
  else
    insert into public.sale_receives (sale_id, wallet_account_id, amount, created_by)
    values (p_id, coalesce(v_old.wallet_account_id, (select wallet_account_id from public.sale_receives where sale_id = p_id limit 1)), v_received, auth.uid());
  end if;
  perform public.allocate_by_priority(p_id, v_qty);
end $$;

drop view if exists public.v_wallet_balance;

create or replace view public.v_wallet_balance with (security_invoker = true) as
select
  w.id as wallet_id,
  w.type,
  w.name,
  w.label,
  w.is_active,
  coalesce((select sum(sr.amount) from public.sale_receives sr join public.sales s on s.id = sr.sale_id where sr.wallet_account_id = w.id and s.deleted_at is null), 0)
    + coalesce((select sum(p.amount) from public.customer_payments p where p.wallet_account_id = w.id and p.deleted_at is null), 0)
    - coalesce((select sum(e.amount) from public.expenses e where e.wallet_account_id = w.id and e.deleted_at is null), 0)
    - coalesce((select sum(wd.amount) from public.withdrawals wd where wd.wallet_account_id = w.id and wd.deleted_at is null), 0)
    - coalesce((select sum(t.amount) from public.wallet_transfers t where t.from_wallet_id = w.id and t.deleted_at is null), 0)
    + coalesce((select sum(t.amount - t.charge) from public.wallet_transfers t where t.to_wallet_id = w.id and t.deleted_at is null), 0) as balance
from public.wallets w
where w.type = 'cash' or w.is_active
order by w.type, w.created_at;

drop view if exists public.v_sales_enriched;

create or replace view public.v_sales_enriched with (security_invoker = true) as
select
  s.id,
  s.sold_at,
  s.qty,
  s.list_unit_price,
  s.amount_received,
  s.due_amount,
  s.discount,
  s.discount * 100.0 / nullif(s.qty * s.list_unit_price, 0) as discount_pct,
  s.customer_id,
  cu.name as customer_name,
  cu.phone as customer_phone,
  s.wallet_account_id,
  w.type as wallet_type,
  w.name as wallet_name,
  w.label as wallet_label,
  coalesce((select string_agg(wr.name || ' ··' || right(wr.label, 2) || ' ' || to_char(sr.amount, 'FM999999999'), ' + ')
    from public.sale_receives sr
    join public.wallets wr on wr.id = sr.wallet_account_id
    where sr.sale_id = s.id), '') as wallet_details,
  s.note,
  s.created_at,
  coalesce((select string_agg(distinct c.code || '/' || pk.code, ', ') from public.sale_allocations sa join public.packets pk on pk.id = sa.packet_id join public.chalans c on c.id = pk.chalan_id where sa.sale_id = s.id), '') as packet_codes,
  coalesce((select string_agg(distinct p.name, ', ') from public.sale_allocations sa join public.packets pk on pk.id = sa.packet_id join public.partners p on p.id = pk.owner_partner_id where sa.sale_id = s.id), '') as owner_names
from public.sales s
join public.wallets w on w.id = s.wallet_account_id
left join public.customers cu on cu.id = s.customer_id
where s.deleted_at is null;

create or replace function public.income_by_period_breakdown(p_start timestamptz, p_end timestamptz)
returns table (
  slice text,
  amount numeric
)
language sql stable security definer set search_path = public, extensions
as $$
  select coalesce(w.type, 'unknown') || '|' || coalesce(w.name, '') as slice, coalesce(sum(sr.amount), 0) as amount
  from public.sale_receives sr
  join public.sales s on s.id = sr.sale_id and s.deleted_at is null
  join public.wallets w on w.id = sr.wallet_account_id
  where s.sold_at >= p_start and s.sold_at < p_end
  group by coalesce(w.type, 'unknown'), coalesce(w.name, '')
  union all
  select 'personal' as slice, coalesce(sum(pu.qty * pu.unit_value), 0) as amount
  from public.personal_uses pu
  where pu.deleted_at is null and pu.at >= p_start and pu.at < p_end
  having coalesce(sum(pu.qty * pu.unit_value), 0) <> 0
$$;

grant execute on function public.create_sale(jsonb), public.update_sale(uuid, jsonb) to authenticated;
grant select on public.v_wallet_balance, public.v_sales_enriched to authenticated;
grant execute on function public.income_by_period_breakdown(timestamptz, timestamptz) to authenticated;
