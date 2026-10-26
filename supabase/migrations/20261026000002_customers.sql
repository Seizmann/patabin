create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz
);

create unique index customers_name_phone on public.customers (name, coalesce(phone, '')) where deleted_at is null;

create trigger trg_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger trg_audit after insert or update or delete on public.customers for each row execute function public.audit_row();

alter table public.customers enable row level security;
alter table public.customers force row level security;
create policy customers_select on public.customers for select to authenticated using (is_active_user());
create policy customers_write on public.customers for insert to authenticated with check (is_active_user() and password_gate());
create policy customers_update on public.customers for update to authenticated using (is_active_user() and password_gate()) with check (is_active_user() and password_gate());

alter table public.sales add column if not exists customer_id uuid references public.customers (id);
create index if not exists sales_customer_idx on public.sales (customer_id);

revoke all on public.customers from anon, authenticated;

create or replace function public.create_sale(p_sale jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_qty integer := (p_sale ->> 'qty')::integer;
  v_price numeric := (p_sale ->> 'list_unit_price')::numeric;
  v_wallet uuid := (p_sale ->> 'wallet_account_id')::uuid;
begin
  perform public.assert_writeable();
  if v_qty is null or v_qty <= 0 or v_price is null or v_price < 0
    or (p_sale ->> 'amount_received')::numeric is null or (p_sale ->> 'amount_received')::numeric < 0 then
    raise exception 'SALE_INVALID';
  end if;
  if not exists (select 1 from public.wallets where id = v_wallet and is_active) then
    raise exception 'SALE_WALLET_INVALID';
  end if;
  insert into public.sales (sold_at, qty, list_unit_price, amount_received, customer_id, customer_name, customer_phone, wallet_account_id, note, created_by)
  values (
    coalesce((p_sale ->> 'sold_at')::timestamptz, now()),
    v_qty, v_price,
    (p_sale ->> 'amount_received')::numeric,
    (p_sale ->> 'customer_id')::uuid,
    nullif(p_sale ->> 'customer_name', ''),
    nullif(p_sale ->> 'customer_phone', ''),
    v_wallet,
    nullif(p_sale ->> 'note', ''),
    auth.uid()
  ) returning id into v_id;
  perform public.allocate_by_priority(v_id, v_qty);
  return v_id;
end $$;

create or replace function public.update_sale(p_id uuid, p_sale jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_old public.sales;
  v_qty integer := (p_sale ->> 'qty')::integer;
  v_freed numeric;
  v_avail numeric;
begin
  perform public.assert_writeable();
  select * into v_old from public.sales where id = p_id and deleted_at is null;
  if v_old.id is null then
    raise exception 'SALE_NOT_FOUND';
  end if;
  if v_qty is null or v_qty <= 0 then
    raise exception 'SALE_INVALID';
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
    amount_received = coalesce((p_sale ->> 'amount_received')::numeric, v_old.amount_received),
    customer_id = (p_sale ->> 'customer_id')::uuid,
    customer_name = nullif(p_sale ->> 'customer_name', ''),
    customer_phone = nullif(p_sale ->> 'customer_phone', ''),
    wallet_account_id = coalesce((p_sale ->> 'wallet_account_id')::uuid, v_old.wallet_account_id),
    note = nullif(p_sale ->> 'note', '')
  where id = p_id;
  perform public.allocate_by_priority(p_id, v_qty);
end $$;

drop view if exists public.v_sales_enriched;

create or replace view public.v_sales_enriched with (security_invoker = true) as
select
  s.id,
  s.sold_at,
  s.qty,
  s.list_unit_price,
  s.amount_received,
  s.discount,
  s.discount * 100.0 / nullif(s.qty * s.list_unit_price, 0) as discount_pct,
  s.customer_id,
  cu.name as customer_name,
  cu.phone as customer_phone,
  s.wallet_account_id,
  w.type as wallet_type,
  w.label as wallet_label,
  s.note,
  s.created_at,
  coalesce((select string_agg(distinct c.code || '/' || pk.code, ', ') from public.sale_allocations sa join public.packets pk on pk.id = sa.packet_id join public.chalans c on c.id = pk.chalan_id where sa.sale_id = s.id), '') as packet_codes,
  coalesce((select string_agg(distinct p.name, ', ') from public.sale_allocations sa join public.packets pk on pk.id = sa.packet_id join public.partners p on p.id = pk.owner_partner_id where sa.sale_id = s.id), '') as owner_names
from public.sales s
join public.wallets w on w.id = s.wallet_account_id
left join public.customers cu on cu.id = s.customer_id
where s.deleted_at is null;

grant select on public.customers to authenticated;
grant insert, update on public.customers to authenticated;
grant select on public.v_sales_enriched to authenticated;
