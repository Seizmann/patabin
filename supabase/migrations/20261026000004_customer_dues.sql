alter table public.sales add column if not exists due_amount numeric(12,2) not null default 0 check (due_amount >= 0);
alter table public.sales drop column if exists discount cascade;
alter table public.sales add column discount numeric(12,2) generated always as (qty * list_unit_price - amount_received - due_amount) stored;

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id),
  amount numeric(12,2) not null check (amount > 0),
  wallet_account_id uuid not null references public.wallets (id),
  at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz
);

drop trigger if exists trg_updated_at on public.customer_payments;
create trigger trg_updated_at before update on public.customer_payments for each row execute function public.set_updated_at();
drop trigger if exists trg_audit on public.customer_payments;
create trigger trg_audit after insert or update or delete on public.customer_payments for each row execute function public.audit_row();

alter table public.customer_payments enable row level security;
alter table public.customer_payments force row level security;
drop policy if exists payments_select on public.customer_payments;
drop policy if exists payments_write on public.customer_payments;
drop policy if exists payments_update on public.customer_payments;
create policy payments_select on public.customer_payments for select to authenticated using (is_active_user());
create policy payments_write on public.customer_payments for insert to authenticated with check (is_active_user() and password_gate());
create policy payments_update on public.customer_payments for update to authenticated using (is_active_user() and password_gate()) with check (is_active_user() and password_gate());

revoke all on public.customer_payments from anon, authenticated;
grant select, insert, update on public.customer_payments to authenticated;

create or replace function public.create_sale(p_sale jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_qty integer := (p_sale ->> 'qty')::integer;
  v_price numeric := (p_sale ->> 'list_unit_price')::numeric;
  v_wallet uuid := (p_sale ->> 'wallet_account_id')::uuid;
  v_due numeric := coalesce((p_sale ->> 'due_amount')::numeric, 0);
begin
  perform public.assert_writeable();
  if v_qty is null or v_qty <= 0 or v_price is null or v_price < 0
    or (p_sale ->> 'amount_received')::numeric is null or (p_sale ->> 'amount_received')::numeric < 0 then
    raise exception 'SALE_INVALID';
  end if;
  if v_due < 0 or v_due + (p_sale ->> 'amount_received')::numeric > v_qty * v_price then
    raise exception 'SALE_INVALID';
  end if;
  if v_due > 0 and (p_sale ->> 'customer_id')::uuid is null then
    raise exception 'SALE_DUE_NEEDS_CUSTOMER';
  end if;
  if not exists (select 1 from public.wallets where id = v_wallet and is_active) then
    raise exception 'SALE_WALLET_INVALID';
  end if;
  insert into public.sales (sold_at, qty, list_unit_price, amount_received, due_amount, customer_id, customer_name, customer_phone, wallet_account_id, note, created_by)
  values (
    coalesce((p_sale ->> 'sold_at')::timestamptz, now()),
    v_qty, v_price,
    (p_sale ->> 'amount_received')::numeric,
    v_due,
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
  v_due numeric := coalesce((p_sale ->> 'due_amount')::numeric, 0);
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
  if v_due < 0 or v_due + coalesce((p_sale ->> 'amount_received')::numeric, v_old.amount_received) > v_qty * coalesce((p_sale ->> 'list_unit_price')::numeric, v_old.list_unit_price) then
    raise exception 'SALE_INVALID';
  end if;
  if v_due > 0 and (p_sale ->> 'customer_id')::uuid is null and v_old.customer_id is null then
    raise exception 'SALE_DUE_NEEDS_CUSTOMER';
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
    due_amount = v_due,
    customer_id = (p_sale ->> 'customer_id')::uuid,
    customer_name = nullif(p_sale ->> 'customer_name', ''),
    customer_phone = nullif(p_sale ->> 'customer_phone', ''),
    wallet_account_id = coalesce((p_sale ->> 'wallet_account_id')::uuid, v_old.wallet_account_id),
    note = nullif(p_sale ->> 'note', '')
  where id = p_id;
  perform public.allocate_by_priority(p_id, v_qty);
end $$;

create or replace function public.create_customer_payment(p_pay jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.assert_writeable();
  if (p_pay ->> 'amount')::numeric is null or (p_pay ->> 'amount')::numeric <= 0
    or not exists (select 1 from public.customers where id = (p_pay ->> 'customer_id')::uuid and deleted_at is null)
    or not exists (select 1 from public.wallets where id = (p_pay ->> 'wallet_account_id')::uuid and is_active) then
    raise exception 'PAYMENT_INVALID';
  end if;
  insert into public.customer_payments (customer_id, amount, wallet_account_id, at, note, created_by)
  values (
    (p_pay ->> 'customer_id')::uuid,
    (p_pay ->> 'amount')::numeric,
    (p_pay ->> 'wallet_account_id')::uuid,
    coalesce((p_pay ->> 'at')::timestamptz, now()),
    nullif(p_pay ->> 'note', ''),
    auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

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
  s.note,
  s.created_at,
  coalesce((select string_agg(distinct c.code || '/' || pk.code, ', ') from public.sale_allocations sa join public.packets pk on pk.id = sa.packet_id join public.chalans c on c.id = pk.chalan_id where sa.sale_id = s.id), '') as packet_codes,
  coalesce((select string_agg(distinct p.name, ', ') from public.sale_allocations sa join public.packets pk on pk.id = sa.packet_id join public.partners p on p.id = pk.owner_partner_id where sa.sale_id = s.id), '') as owner_names
from public.sales s
join public.wallets w on w.id = s.wallet_account_id
left join public.customers cu on cu.id = s.customer_id
where s.deleted_at is null;

drop view if exists public.v_wallet_balance;

create or replace view public.v_wallet_balance with (security_invoker = true) as
select
  w.id as wallet_id,
  w.type,
  w.name,
  w.label,
  w.is_active,
  coalesce((select sum(s.amount_received) from public.sales s where s.wallet_account_id = w.id and s.deleted_at is null), 0)
    + coalesce((select sum(p.amount) from public.customer_payments p where p.wallet_account_id = w.id and p.deleted_at is null), 0)
    - coalesce((select sum(e.amount) from public.expenses e where e.wallet_account_id = w.id and e.deleted_at is null), 0)
    - coalesce((select sum(wd.amount) from public.withdrawals wd where wd.wallet_account_id = w.id and wd.deleted_at is null), 0)
    - coalesce((select sum(t.amount) from public.wallet_transfers t where t.from_wallet_id = w.id and t.deleted_at is null), 0)
    + coalesce((select sum(t.amount - t.charge) from public.wallet_transfers t where t.to_wallet_id = w.id and t.deleted_at is null), 0) as balance
from public.wallets w
where w.type = 'cash' or w.is_active
order by w.type, w.created_at;

create or replace view public.v_customer_balance with (security_invoker = true) as
select
  cu.id as customer_id,
  cu.name,
  cu.phone,
  coalesce((select sum(s.due_amount) from public.sales s where s.customer_id = cu.id and s.deleted_at is null), 0)
    - coalesce((select sum(p.amount) from public.customer_payments p where p.customer_id = cu.id and p.deleted_at is null), 0) as balance
from public.customers cu
where cu.deleted_at is null
order by cu.name;

grant execute on function public.create_sale(jsonb), public.update_sale(uuid, jsonb), public.create_customer_payment(jsonb) to authenticated;
grant select on public.v_sales_enriched, public.v_customer_balance, public.v_wallet_balance to authenticated;
