drop view if exists public.v_dashboard_day, public.v_sales_enriched, public.v_partner_balance, public.v_partner_batch_payout, public.v_batch_profit, public.v_batch_summary, public.v_batch_stock cascade;

drop table if exists public.sale_allocations cascade;
drop table if exists public.sales cascade;
drop table if exists public.batch_close_snapshots cascade;
drop table if exists public.stock_adjustments cascade;
drop table if exists public.expenses cascade;
drop table if exists public.batch_contributions cascade;
drop table if exists public.transfers cascade;
drop table if exists public.batches cascade;

drop function if exists public.dashboard_totals(timestamptz, timestamptz);
drop function if exists public.income_by_period_breakdown(timestamptz, timestamptz);
drop function if exists public.available_pcs();
drop function if exists public.create_sale(jsonb);
drop function if exists public.update_sale(uuid, jsonb);
drop function if exists public.delete_sale(uuid);
drop function if exists public.create_batch(jsonb);
drop function if exists public.close_batch(uuid);
drop function if exists public.reopen_batch(uuid);
drop function if exists public.guard_closed_batch();
drop function if exists public.guard_sales();

alter table public.settings add column if not exists default_packet_size integer not null default 20;

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
insert into public.expense_categories (name) values
  ('ট্রান্সপোর্ট'), ('সিগারেট'), ('মোবাইল রিচার্জ'), ('অন্যান্য')
on conflict (name) do nothing;

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('cash','bkash','nagad')),
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create unique index wallets_single_cash on public.wallets (type) where type = 'cash' and is_active;

create table public.chalans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  purchase_date timestamptz not null default now(),
  buy_rate numeric(12,2) not null default 190,
  pcs_per_packet integer not null default 20,
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  closed_by uuid,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz
);

create table public.chalan_purchases (
  id uuid primary key default gen_random_uuid(),
  chalan_id uuid not null references public.chalans (id) on delete cascade,
  partner_id uuid not null references public.partners (id),
  qty integer not null check (qty > 0),
  amount_paid numeric(12,2) not null check (amount_paid >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz,
  unique (chalan_id, partner_id)
);

create table public.packets (
  id uuid primary key default gen_random_uuid(),
  chalan_id uuid not null references public.chalans (id) on delete cascade,
  code text not null,
  owner_partner_id uuid not null references public.partners (id),
  total_pcs integer not null check (total_pcs > 0),
  packed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz,
  unique (chalan_id, code)
);

create table public.sell_priority (
  packet_id uuid primary key references public.packets (id) on delete cascade,
  position integer not null
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sold_at timestamptz not null default now(),
  qty integer not null check (qty > 0),
  list_unit_price numeric(12,2) not null check (list_unit_price >= 0),
  amount_received numeric(12,2) not null check (amount_received >= 0),
  discount numeric(12,2) generated always as (qty * list_unit_price - amount_received) stored,
  customer_name text,
  customer_phone text,
  wallet_account_id uuid not null references public.wallets (id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz
);

create table public.sale_allocations (
  sale_id uuid not null references public.sales (id) on delete cascade,
  packet_id uuid not null references public.packets (id),
  qty integer not null check (qty > 0),
  created_at timestamptz not null default now(),
  primary key (sale_id, packet_id)
);

create table public.personal_uses (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  eater_partner_id uuid not null references public.partners (id),
  packet_id uuid references public.packets (id),
  chalan_id uuid references public.chalans (id),
  qty integer not null check (qty > 0),
  unit_value numeric(12,2) not null check (unit_value >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz
);

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  packet_id uuid not null references public.packets (id),
  qty integer not null check (qty > 0),
  reason text not null check (reason in ('gift','damage','loss','sample','other')),
  person text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.expense_categories (id),
  amount numeric(12,2) not null check (amount > 0),
  paid_by_partner_id uuid not null references public.partners (id),
  attributed_to_partner_id uuid not null references public.partners (id),
  wallet_account_id uuid references public.wallets (id),
  chalan_id uuid references public.chalans (id),
  note text,
  spent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz
);

create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  partner_id uuid not null references public.partners (id),
  wallet_account_id uuid not null references public.wallets (id),
  amount numeric(12,2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz
);

create table public.wallet_transfers (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  from_wallet_id uuid not null references public.wallets (id),
  to_wallet_id uuid not null references public.wallets (id),
  amount numeric(12,2) not null check (amount > 0),
  charge numeric(12,2) not null default 0 check (charge >= 0),
  attributed_to_partner_id uuid not null references public.partners (id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz,
  check (from_wallet_id <> to_wallet_id)
);

create table public.chalan_close_snapshots (
  chalan_id uuid primary key references public.chalans (id) on delete cascade,
  closed_at timestamptz not null default now(),
  closed_by uuid,
  data jsonb not null
);

create trigger trg_updated_at before update on public.chalans for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.chalan_purchases for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.packets for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.sales for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.personal_uses for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.stock_adjustments for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.expenses for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.wallets for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.withdrawals for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.wallet_transfers for each row execute function public.set_updated_at();

create trigger trg_audit after insert or update or delete on public.chalans for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.chalan_purchases for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.packets for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.sales for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.personal_uses for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.stock_adjustments for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.expenses for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.wallets for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.withdrawals for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.wallet_transfers for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.chalan_close_snapshots for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.expense_categories for each row execute function public.audit_row();

create or replace function public.guard_closed_chalan() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_chalan_id uuid;
begin
  if tg_op = 'DELETE' then
    if tg_table_name = 'sale_allocations' and exists (select 1 from public.sales where id = old.sale_id and deleted_at is not null) then
      return old;
    end if;
  end if;
  v_chalan_id := coalesce(new.chalan_id, old.chalan_id);
  if v_chalan_id is null then
    v_chalan_id := (
      select c.id from public.packets pk
      join public.chalans c on c.id = pk.chalan_id
      where pk.id = coalesce(new.packet_id, old.packet_id)
    );
  end if;
  if exists (select 1 from public.chalans where id = v_chalan_id and (status = 'closed' or deleted_at is not null)) then
    raise exception 'CHALAN_CLOSED';
  end if;
  return coalesce(new, old);
end $$;

create trigger trg_guard_closed before insert or update or delete on public.chalan_purchases for each row execute function public.guard_closed_chalan();
create trigger trg_guard_closed before insert or update or delete on public.packets for each row execute function public.guard_closed_chalan();
create trigger trg_guard_closed before insert or update or delete on public.personal_uses for each row execute function public.guard_closed_chalan();
create trigger trg_guard_closed before insert or update or delete on public.stock_adjustments for each row execute function public.guard_closed_chalan();
create trigger trg_guard_closed before insert or update or delete on public.expenses for each row execute function public.guard_closed_chalan();
create trigger trg_guard_closed before insert or update or delete on public.sale_allocations for each row execute function public.guard_closed_chalan();

create or replace function public.guard_sales() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'HARD_DELETE_BLOCKED';
  end if;
  if tg_op = 'UPDATE' and new.deleted_at is null
    and exists (
      select 1 from public.sale_allocations sa
      join public.packets pk on pk.id = sa.packet_id
      join public.chalans c on c.id = pk.chalan_id
      where sa.sale_id = new.id and (c.status = 'closed' or c.deleted_at is not null or pk.deleted_at is not null)
    ) then
    raise exception 'CHALAN_CLOSED';
  end if;
  return new;
end $$;

create trigger trg_guard_sales before update or delete on public.sales for each row execute function public.guard_sales();

create or replace function public.packet_remaining(p_packet_id uuid) returns numeric
language sql stable security definer set search_path = public
as $$
  select
    pk.total_pcs
    - coalesce((select sum(sa.qty) from public.sale_allocations sa join public.sales s on s.id = sa.sale_id where sa.packet_id = pk.id and s.deleted_at is null), 0)
    - coalesce((select sum(pu.qty) from public.personal_uses pu where pu.packet_id = pk.id and pu.deleted_at is null), 0)
    - coalesce((select sum(aj.qty) from public.stock_adjustments aj where aj.packet_id = pk.id and aj.deleted_at is null), 0)
  from public.packets pk
  where pk.id = p_packet_id and pk.deleted_at is null
$$;

create or replace function public.create_chalan(p_payload jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
  v_next integer;
  v_rate numeric;
  v_size integer;
  r jsonb;
begin
  perform public.assert_writeable();
  if jsonb_typeof(p_payload -> 'items') <> 'array' or jsonb_array_length(p_payload -> 'items') = 0 then
    raise exception 'CHALAN_NO_ITEMS';
  end if;
  v_rate := coalesce((p_payload ->> 'buy_rate')::numeric, (select default_buy_rate from public.settings where id = 1));
  v_size := coalesce((p_payload ->> 'pcs_per_packet')::integer, (select default_packet_size from public.settings where id = 1));
  if v_rate is null or v_rate < 0 or v_size is null or v_size <= 0 then
    raise exception 'CHALAN_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtext('patabin_chalan_code'));
  select coalesce(max(substring(code from 3)::integer), 0) + 1 into v_next
  from public.chalans where code ~ '^C-\d{3,}$';
  v_code := 'C-' || lpad(v_next::text, 3, '0');
  insert into public.chalans (code, purchase_date, buy_rate, pcs_per_packet, note, created_by)
  values (
    v_code,
    coalesce((p_payload ->> 'purchase_date')::timestamptz, now()),
    v_rate, v_size,
    nullif(p_payload ->> 'note', ''),
    auth.uid()
  ) returning id into v_id;
  for r in select jsonb_array_elements(p_payload -> 'items') loop
    if (r ->> 'qty')::integer is null or (r ->> 'qty')::integer <= 0
      or not exists (select 1 from public.partners where id = (r ->> 'partner_id')::uuid and deleted_at is null) then
      raise exception 'CHALAN_ITEM_INVALID';
    end if;
    insert into public.chalan_purchases (chalan_id, partner_id, qty, amount_paid, created_by)
    values (
      v_id,
      (r ->> 'partner_id')::uuid,
      (r ->> 'qty')::integer,
      coalesce((r ->> 'amount_paid')::numeric, round((r ->> 'qty')::integer * v_rate, 2)),
      auth.uid()
    );
  end loop;
  return v_id;
end $$;

create or replace function public.create_packets(p_payload jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_chalan uuid := (p_payload ->> 'chalan_id')::uuid;
  v_size integer := coalesce((p_payload ->> 'pcs_per_packet')::integer, (select pcs_per_packet from public.chalans where id = v_chalan));
  v_next integer;
  v_pos integer;
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
  for r in select jsonb_array_elements(p_payload -> 'items') loop
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

create or replace function public.set_sell_priority(p_ordered uuid[]) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_i integer := 0;
begin
  perform public.assert_writeable();
  if coalesce(array_length(p_ordered, 1), 0) = 0 then
    raise exception 'PRIORITY_EMPTY';
  end if;
  if (select count(distinct x) from unnest(p_ordered) x) <> array_length(p_ordered, 1) then
    raise exception 'PRIORITY_DUPLICATE';
  end if;
  if (select count(*) from public.packets pk where pk.id = any(p_ordered) and pk.deleted_at is null) <> array_length(p_ordered, 1) then
    raise exception 'PRIORITY_UNKNOWN_PACKET';
  end if;
  for v_id in select * from unnest(p_ordered) loop
    v_i := v_i + 1;
    insert into public.sell_priority (packet_id, position) values (v_id, v_i)
    on conflict (packet_id) do update set position = excluded.position;
  end loop;
end $$;

create or replace function public.allocate_by_priority(p_sale_id uuid, p_qty integer) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_remaining numeric := p_qty;
  v_row record;
  v_take numeric;
begin
  for v_row in
    select pk.id,
      pk.total_pcs
      - coalesce((select sum(sa.qty) from public.sale_allocations sa join public.sales s on s.id = sa.sale_id where sa.packet_id = pk.id and s.deleted_at is null), 0)
      - coalesce((select sum(pu.qty) from public.personal_uses pu where pu.packet_id = pk.id and pu.deleted_at is null), 0)
      - coalesce((select sum(aj.qty) from public.stock_adjustments aj where aj.packet_id = pk.id and aj.deleted_at is null), 0) as remaining
    from public.packets pk
    join public.chalans c on c.id = pk.chalan_id
    left join public.sell_priority sp on sp.packet_id = pk.id
    where pk.deleted_at is null and c.deleted_at is null and c.status = 'open'
    order by sp.position nulls last, pk.created_at
    for update of pk
  loop
    exit when v_remaining <= 0;
    if v_row.remaining > 0 then
      v_take := least(v_remaining, v_row.remaining);
      insert into public.sale_allocations (sale_id, packet_id, qty) values (p_sale_id, v_row.id, v_take);
      v_remaining := v_remaining - v_take;
    end if;
  end loop;
  if v_remaining > 0 then
    raise exception 'NO_STOCK';
  end if;
end $$;

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
  insert into public.sales (sold_at, qty, list_unit_price, amount_received, customer_name, customer_phone, wallet_account_id, note, created_by)
  values (
    coalesce((p_sale ->> 'sold_at')::timestamptz, now()),
    v_qty, v_price,
    (p_sale ->> 'amount_received')::numeric,
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
    customer_name = nullif(p_sale ->> 'customer_name', ''),
    customer_phone = nullif(p_sale ->> 'customer_phone', ''),
    wallet_account_id = coalesce((p_sale ->> 'wallet_account_id')::uuid, v_old.wallet_account_id),
    note = nullif(p_sale ->> 'note', '')
  where id = p_id;
  perform public.allocate_by_priority(p_id, v_qty);
end $$;

create or replace function public.delete_sale(p_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_writeable();
  if exists (
    select 1 from public.sale_allocations sa
    join public.packets pk on pk.id = sa.packet_id
    join public.chalans c on c.id = pk.chalan_id
    where sa.sale_id = p_id and (c.status = 'closed' or c.deleted_at is not null or pk.deleted_at is not null)
  ) then
    raise exception 'CHALAN_CLOSED';
  end if;
  update public.sales set deleted_at = now() where id = p_id and deleted_at is null;
  delete from public.sale_allocations where sale_id = p_id;
end $$;

create or replace function public.create_personal_use(p_use jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_packet uuid := (p_use ->> 'packet_id')::uuid;
  v_qty integer := (p_use ->> 'qty')::integer;
  v_value numeric := coalesce((p_use ->> 'unit_value')::numeric, (select default_sell_price from public.settings where id = 1));
  v_chalan uuid;
begin
  perform public.assert_writeable();
  if v_qty is null or v_qty <= 0 or v_value is null or v_value < 0
    or not exists (select 1 from public.partners where id = (p_use ->> 'eater_partner_id')::uuid and deleted_at is null) then
    raise exception 'PERSONAL_INVALID';
  end if;
  if v_packet is not null then
    if public.packet_remaining(v_packet) is null then
      raise exception 'PACKET_NOT_FOUND';
    end if;
    if public.packet_remaining(v_packet) < v_qty then
      raise exception 'NO_STOCK';
    end if;
    select chalan_id into v_chalan from public.packets where id = v_packet;
  else
    v_chalan := (p_use ->> 'chalan_id')::uuid;
  end if;
  insert into public.personal_uses (at, eater_partner_id, packet_id, chalan_id, qty, unit_value, note, created_by)
  values (
    coalesce((p_use ->> 'at')::timestamptz, now()),
    (p_use ->> 'eater_partner_id')::uuid,
    v_packet,
    v_chalan,
    v_qty,
    v_value,
    nullif(p_use ->> 'note', ''),
    auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

create or replace function public.create_adjustment(p_adj jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_packet uuid := (p_adj ->> 'packet_id')::uuid;
  v_qty integer := (p_adj ->> 'qty')::integer;
begin
  perform public.assert_writeable();
  if v_qty is null or v_qty <= 0
    or coalesce(p_adj ->> 'reason', 'other') not in ('gift','damage','loss','sample','other') then
    raise exception 'ADJUSTMENT_INVALID';
  end if;
  if v_packet is null or public.packet_remaining(v_packet) is null then
    raise exception 'PACKET_NOT_FOUND';
  end if;
  if public.packet_remaining(v_packet) < v_qty then
    raise exception 'NO_STOCK';
  end if;
  insert into public.stock_adjustments (at, packet_id, qty, reason, person, note, created_by)
  values (
    coalesce((p_adj ->> 'at')::timestamptz, now()),
    v_packet,
    v_qty,
    p_adj ->> 'reason',
    nullif(p_adj ->> 'person', ''),
    nullif(p_adj ->> 'note', ''),
    auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

create or replace function public.create_expense(p_exp jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_wallet uuid := (p_exp ->> 'wallet_account_id')::uuid;
begin
  perform public.assert_writeable();
  if (p_exp ->> 'amount')::numeric is null or (p_exp ->> 'amount')::numeric <= 0
    or not exists (select 1 from public.expense_categories where id = (p_exp ->> 'category_id')::uuid)
    or not exists (select 1 from public.partners where id = (p_exp ->> 'paid_by_partner_id')::uuid and deleted_at is null)
    or not exists (select 1 from public.partners where id = (p_exp ->> 'attributed_to_partner_id')::uuid and deleted_at is null)
    or (v_wallet is not null and not exists (select 1 from public.wallets where id = v_wallet and is_active))
    or ((p_exp ->> 'chalan_id')::uuid is not null and not exists (select 1 from public.chalans where id = (p_exp ->> 'chalan_id')::uuid and status = 'open' and deleted_at is null)) then
    raise exception 'EXPENSE_INVALID';
  end if;
  insert into public.expenses (category_id, amount, paid_by_partner_id, attributed_to_partner_id, wallet_account_id, chalan_id, note, spent_at, created_by)
  values (
    (p_exp ->> 'category_id')::uuid,
    (p_exp ->> 'amount')::numeric,
    (p_exp ->> 'paid_by_partner_id')::uuid,
    (p_exp ->> 'attributed_to_partner_id')::uuid,
    v_wallet,
    (p_exp ->> 'chalan_id')::uuid,
    nullif(p_exp ->> 'note', ''),
    coalesce((p_exp ->> 'spent_at')::timestamptz, now()),
    auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

create or replace function public.update_expense(p_id uuid, p_exp jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_old public.expenses;
  v_wallet uuid := (p_exp ->> 'wallet_account_id')::uuid;
begin
  perform public.assert_writeable();
  select * into v_old from public.expenses where id = p_id and deleted_at is null;
  if v_old.id is null then
    raise exception 'EXPENSE_NOT_FOUND';
  end if;
  if v_old.chalan_id is not null
    and exists (select 1 from public.chalans where id = v_old.chalan_id and (status = 'closed' or deleted_at is not null)) then
    raise exception 'CHALAN_CLOSED';
  end if;
  if (p_exp ->> 'amount')::numeric is not null and (p_exp ->> 'amount')::numeric <= 0 then
    raise exception 'EXPENSE_INVALID';
  end if;
  if not exists (select 1 from public.expense_categories where id = coalesce((p_exp ->> 'category_id')::uuid, v_old.category_id))
    or not exists (select 1 from public.partners where id = coalesce((p_exp ->> 'paid_by_partner_id')::uuid, v_old.paid_by_partner_id) and deleted_at is null)
    or not exists (select 1 from public.partners where id = coalesce((p_exp ->> 'attributed_to_partner_id')::uuid, v_old.attributed_to_partner_id) and deleted_at is null)
    or (v_wallet is not null and not exists (select 1 from public.wallets where id = v_wallet and is_active)) then
    raise exception 'EXPENSE_INVALID';
  end if;
  update public.expenses set
    category_id = coalesce((p_exp ->> 'category_id')::uuid, v_old.category_id),
    amount = coalesce((p_exp ->> 'amount')::numeric, v_old.amount),
    paid_by_partner_id = coalesce((p_exp ->> 'paid_by_partner_id')::uuid, v_old.paid_by_partner_id),
    attributed_to_partner_id = coalesce((p_exp ->> 'attributed_to_partner_id')::uuid, v_old.attributed_to_partner_id),
    wallet_account_id = v_wallet,
    chalan_id = v_old.chalan_id,
    note = nullif(p_exp ->> 'note', ''),
    spent_at = coalesce((p_exp ->> 'spent_at')::timestamptz, v_old.spent_at)
  where id = p_id;
end $$;

create or replace function public.delete_expense(p_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_writeable();
  if exists (
    select 1 from public.expenses e
    join public.chalans c on c.id = e.chalan_id
    where e.id = p_id and (c.status = 'closed' or c.deleted_at is not null)
  ) then
    raise exception 'CHALAN_CLOSED';
  end if;
  update public.expenses set deleted_at = now() where id = p_id and deleted_at is null;
end $$;

create or replace function public.create_withdrawal(p_w jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_wallet uuid := (p_w ->> 'wallet_account_id')::uuid;
begin
  perform public.assert_writeable();
  if (p_w ->> 'amount')::numeric is null or (p_w ->> 'amount')::numeric <= 0
    or not exists (select 1 from public.partners where id = (p_w ->> 'partner_id')::uuid and deleted_at is null)
    or not exists (select 1 from public.wallets where id = v_wallet and is_active) then
    raise exception 'WITHDRAWAL_INVALID';
  end if;
  insert into public.withdrawals (at, partner_id, wallet_account_id, amount, note, created_by)
  values (
    coalesce((p_w ->> 'at')::timestamptz, now()),
    (p_w ->> 'partner_id')::uuid,
    v_wallet,
    (p_w ->> 'amount')::numeric,
    nullif(p_w ->> 'note', ''),
    auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

create or replace function public.create_transfer(p_t jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_from uuid := (p_t ->> 'from_wallet_id')::uuid;
  v_to uuid := (p_t ->> 'to_wallet_id')::uuid;
  v_type_from text;
  v_type_to text;
  v_charge numeric := coalesce((p_t ->> 'charge')::numeric, 0);
begin
  perform public.assert_writeable();
  select type into v_type_from from public.wallets where id = v_from and is_active;
  select type into v_type_to from public.wallets where id = v_to and is_active;
  if v_type_from is null or v_type_to is null or v_from = v_to then
    raise exception 'TRANSFER_INVALID';
  end if;
  if (p_t ->> 'amount')::numeric is null or (p_t ->> 'amount')::numeric <= 0 or v_charge < 0 then
    raise exception 'TRANSFER_INVALID';
  end if;
  if v_type_from = 'cash' and v_charge <> 0 then
    raise exception 'TRANSFER_CASH_SOURCE_FREE';
  end if;
  if not exists (select 1 from public.partners where id = (p_t ->> 'attributed_to_partner_id')::uuid and deleted_at is null) then
    raise exception 'TRANSFER_INVALID';
  end if;
  insert into public.wallet_transfers (at, from_wallet_id, to_wallet_id, amount, charge, attributed_to_partner_id, note, created_by)
  values (
    coalesce((p_t ->> 'at')::timestamptz, now()),
    v_from, v_to,
    (p_t ->> 'amount')::numeric,
    v_charge,
    (p_t ->> 'attributed_to_partner_id')::uuid,
    nullif(p_t ->> 'note', ''),
    auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

create or replace function public.close_chalan(p_chalan_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_remaining numeric;
  v_summary record;
  v_partners jsonb;
  v_wallets jsonb;
begin
  perform public.assert_writeable();
  select coalesce(sum(public.packet_remaining(pk.id)), 0) into v_remaining
  from public.packets pk
  where pk.chalan_id = p_chalan_id and pk.deleted_at is null;
  if v_remaining is null then
    raise exception 'CHALAN_NOT_FOUND';
  end if;
  if v_remaining <> 0 then
    raise exception 'STOCK_LEFT';
  end if;
  select * into v_summary from public.v_chalan_summary where chalan_id = p_chalan_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'partner_id', pv.partner_id,
    'partner_name', pv.partner_name,
    'capital', pv.capital,
    'ext_rev', pv.ext_rev,
    'internal_rev', pv.internal_rev,
    'pcs_out', pv.pcs_out,
    'cost', pv.cost,
    'profit', pv.profit,
    'consumption_due', pv.consumption_due,
    'expenses_attributed', pv.expenses_attributed,
    'pocket_paid', pv.pocket_paid,
    'entitlement', pv.entitlement
  )), '[]'::jsonb) into v_partners
  from public.v_partner_chalan_settlement pv
  where pv.chalan_id = p_chalan_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'wallet_id', w.id,
    'type', w.type,
    'label', w.label,
    'balance', w.balance
  )), '[]'::jsonb) into v_wallets
  from public.v_wallet_balance w;
  update public.chalans set status = 'closed', closed_at = now(), closed_by = auth.uid() where id = p_chalan_id and status = 'open';
  if not found then
    raise exception 'CHALAN_ALREADY_CLOSED';
  end if;
  insert into public.chalan_close_snapshots (chalan_id, closed_at, closed_by, data)
  values (p_chalan_id, now(), auth.uid(), jsonb_build_object(
    'summary', to_jsonb(v_summary),
    'partners', v_partners,
    'wallets', v_wallets
  ))
  on conflict (chalan_id) do update set closed_at = excluded.closed_at, closed_by = excluded.closed_by, data = excluded.data;
end $$;

create or replace function public.reopen_chalan(p_chalan_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_writeable();
  if not exists (select 1 from public.chalans where id = p_chalan_id and status = 'closed' and deleted_at is null) then
    raise exception 'CHALAN_NOT_CLOSED';
  end if;
  delete from public.chalan_close_snapshots where chalan_id = p_chalan_id;
  update public.chalans set status = 'open', closed_at = null, closed_by = null where id = p_chalan_id;
end $$;

alter table public.expense_categories enable row level security;
alter table public.expense_categories force row level security;
alter table public.wallets enable row level security;
alter table public.wallets force row level security;
alter table public.chalans enable row level security;
alter table public.chalans force row level security;
alter table public.chalan_purchases enable row level security;
alter table public.chalan_purchases force row level security;
alter table public.packets enable row level security;
alter table public.packets force row level security;
alter table public.sell_priority enable row level security;
alter table public.sell_priority force row level security;
alter table public.sales enable row level security;
alter table public.sales force row level security;
alter table public.sale_allocations enable row level security;
alter table public.sale_allocations force row level security;
alter table public.personal_uses enable row level security;
alter table public.personal_uses force row level security;
alter table public.stock_adjustments enable row level security;
alter table public.stock_adjustments force row level security;
alter table public.expenses enable row level security;
alter table public.expenses force row level security;
alter table public.withdrawals enable row level security;
alter table public.withdrawals force row level security;
alter table public.wallet_transfers enable row level security;
alter table public.wallet_transfers force row level security;
alter table public.chalan_close_snapshots enable row level security;
alter table public.chalan_close_snapshots force row level security;

create policy categories_select on public.expense_categories for select to authenticated using (is_active_user());
create policy categories_write on public.expense_categories for insert to authenticated with check (is_su_admin());
create policy categories_delete on public.expense_categories for update to authenticated using (is_su_admin()) with check (is_su_admin());

create policy wallets_select on public.wallets for select to authenticated using (is_active_user());
create policy wallets_write on public.wallets for insert to authenticated with check (is_active_user() and password_gate());
create policy wallets_update on public.wallets for update to authenticated using (is_active_user() and password_gate()) with check (is_active_user() and password_gate());

create policy chalans_select on public.chalans for select to authenticated using (is_active_user());
create policy chalans_write on public.chalans for insert to authenticated with check (is_active_user() and password_gate());
create policy chalans_update on public.chalans for update to authenticated using (is_active_user() and password_gate()) with check (is_active_user() and password_gate());

create policy purchases_select on public.chalan_purchases for select to authenticated using (is_active_user());
create policy purchases_write on public.chalan_purchases for insert to authenticated with check (is_active_user() and password_gate());
create policy purchases_update on public.chalan_purchases for update to authenticated using (is_active_user() and password_gate()) with check (is_active_user() and password_gate());

create policy packets_select on public.packets for select to authenticated using (is_active_user());
create policy packets_write on public.packets for insert to authenticated with check (is_active_user() and password_gate());
create policy packets_update on public.packets for update to authenticated using (is_active_user() and password_gate()) with check (is_active_user() and password_gate());

create policy priority_select on public.sell_priority for select to authenticated using (is_active_user());

create policy sales_select on public.sales for select to authenticated using (is_active_user());
create policy allocations_select on public.sale_allocations for select to authenticated using (is_active_user());

create policy personal_select on public.personal_uses for select to authenticated using (is_active_user());
create policy personal_write on public.personal_uses for insert to authenticated with check (is_active_user() and password_gate());
create policy personal_update on public.personal_uses for update to authenticated using (is_active_user() and password_gate()) with check (is_active_user() and password_gate());

create policy adjustments_select on public.stock_adjustments for select to authenticated using (is_active_user());
create policy adjustments_write on public.stock_adjustments for insert to authenticated with check (is_active_user() and password_gate());
create policy adjustments_update on public.stock_adjustments for update to authenticated using (is_active_user() and password_gate()) with check (is_active_user() and password_gate());

create policy expenses_select on public.expenses for select to authenticated using (is_active_user());
create policy expenses_write on public.expenses for insert to authenticated with check (is_active_user() and password_gate());
create policy expenses_update on public.expenses for update to authenticated using (is_active_user() and password_gate()) with check (is_active_user() and password_gate());

create policy withdrawals_select on public.withdrawals for select to authenticated using (is_active_user());
create policy withdrawals_write on public.withdrawals for insert to authenticated with check (is_active_user() and password_gate());
create policy withdrawals_update on public.withdrawals for update to authenticated using (is_active_user() and password_gate()) with check (is_active_user() and password_gate());

create policy transfers_select on public.wallet_transfers for select to authenticated using (is_active_user());
create policy transfers_write on public.wallet_transfers for insert to authenticated with check (is_active_user() and password_gate());
create policy transfers_update on public.wallet_transfers for update to authenticated using (is_active_user() and password_gate()) with check (is_active_user() and password_gate());

create policy snapshots_select on public.chalan_close_snapshots for select to authenticated using (is_active_user());

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, public;

create or replace view public.v_packet_stock with (security_invoker = true) as
select
  pk.id as packet_id,
  pk.chalan_id,
  c.code as chalan_code,
  c.status as chalan_status,
  pk.code as packet_code,
  pk.owner_partner_id,
  p.name as owner_name,
  pk.total_pcs,
  coalesce(public.packet_remaining(pk.id), 0) as remaining,
  sp.position
from public.packets pk
join public.chalans c on c.id = pk.chalan_id
join public.partners p on p.id = pk.owner_partner_id
left join public.sell_priority sp on sp.packet_id = pk.id
where pk.deleted_at is null and c.deleted_at is null
order by sp.position nulls last, pk.created_at;

create or replace view public.v_chalan_summary with (security_invoker = true) as
select
  c.id as chalan_id,
  c.code,
  c.status,
  coalesce((select sum(qty) from public.chalan_purchases cp where cp.chalan_id = c.id and cp.deleted_at is null), 0) as bought_pcs,
  coalesce((select sum(amount_paid) from public.chalan_purchases cp where cp.chalan_id = c.id and cp.deleted_at is null), 0) as capital,
  coalesce((select sum(sa.qty) from public.sale_allocations sa join public.sales s on s.id = sa.sale_id join public.packets pk on pk.id = sa.packet_id where pk.chalan_id = c.id and s.deleted_at is null), 0) as sold_pcs,
  coalesce((select sum(pu.qty) from public.personal_uses pu where (pu.chalan_id = c.id or pu.packet_id in (select id from public.packets where chalan_id = c.id)) and pu.deleted_at is null), 0) as personal_pcs,
  coalesce((select sum(aj.qty) from public.stock_adjustments aj join public.packets pk on pk.id = aj.packet_id where pk.chalan_id = c.id and aj.deleted_at is null), 0) as adjusted_pcs,
  coalesce((select sum(public.packet_remaining(pk.id)) from public.packets pk where pk.chalan_id = c.id and pk.deleted_at is null), 0) as remaining,
  coalesce((select sum(e.amount) from public.expenses e where e.chalan_id = c.id and e.deleted_at is null), 0) as expenses
from public.chalans c
where c.deleted_at is null;

create or replace view public.v_partner_chalan_settlement with (security_invoker = true) as
with rev as (
  select chalan_id, partner_id, sum(share) as share
  from (
    select t.chalan_id, t.partner_id,
      round(t.share, 2)
      + (case when t.rn = 1 then t.amount_received - sum(round(t.share, 2)) over (partition by t.sale_id) else 0 end) as share
    from (
      select s.id as sale_id, pk.chalan_id, pk.owner_partner_id as partner_id, sum(sa.qty) as qty,
        s.amount_received * sum(sa.qty) / s.qty as share,
        s.amount_received,
        row_number() over (partition by s.id order by sum(sa.qty) desc, pk.owner_partner_id) as rn
      from public.sale_allocations sa
      join public.sales s on s.id = sa.sale_id and s.deleted_at is null
      join public.packets pk on pk.id = sa.packet_id
      group by s.id, pk.chalan_id, pk.owner_partner_id, s.amount_received, s.qty
    ) t
  ) u
  group by chalan_id, partner_id
),
pcs_out as (
  select pk.chalan_id, pk.owner_partner_id as partner_id, sum(x.qty) as qty
  from (
    select sa.packet_id, sa.qty from public.sale_allocations sa join public.sales s on s.id = sa.sale_id and s.deleted_at is null
    union all
    select pu.packet_id, pu.qty from public.personal_uses pu where pu.packet_id is not null and pu.deleted_at is null
    union all
    select aj.packet_id, aj.qty from public.stock_adjustments aj where aj.deleted_at is null
  ) x
  join public.packets pk on pk.id = x.packet_id
  where pk.deleted_at is null
  group by pk.chalan_id, pk.owner_partner_id
),
kept as (
  select pu.chalan_id, pu.eater_partner_id as partner_id, sum(pu.qty) as qty
  from public.personal_uses pu
  where pu.packet_id is null and pu.chalan_id is not null and pu.deleted_at is null
  group by pu.chalan_id, pu.eater_partner_id
),
internal_rev as (
  select pk.chalan_id, pk.owner_partner_id as partner_id, sum(pu.qty * pu.unit_value) as amount
  from public.personal_uses pu
  join public.packets pk on pk.id = pu.packet_id
  where pu.deleted_at is null and pu.eater_partner_id <> pk.owner_partner_id
  group by pk.chalan_id, pk.owner_partner_id
),
consumption as (
  select pk.chalan_id, pu.eater_partner_id as partner_id, sum(pu.qty * pu.unit_value) as amount
  from public.personal_uses pu
  join public.packets pk on pk.id = pu.packet_id
  where pu.deleted_at is null and pu.eater_partner_id <> pk.owner_partner_id
  group by pk.chalan_id, pu.eater_partner_id
),
capital as (
  select cp.chalan_id, cp.partner_id,
    sum(cp.amount_paid) as amount,
    max(c.buy_rate) as buy_rate
  from public.chalan_purchases cp
  join public.chalans c on c.id = cp.chalan_id
  where cp.deleted_at is null
  group by cp.chalan_id, cp.partner_id
),
expenses_attr as (
  select e.chalan_id, e.attributed_to_partner_id as partner_id, sum(e.amount) as amount
  from public.expenses e
  where e.deleted_at is null and e.chalan_id is not null
  group by e.chalan_id, e.attributed_to_partner_id
),
pocket as (
  select e.chalan_id, e.paid_by_partner_id as partner_id, sum(e.amount) as amount
  from public.expenses e
  where e.deleted_at is null and e.chalan_id is not null and e.wallet_account_id is null
  group by e.chalan_id, e.paid_by_partner_id
),
partners as (
  select cp.chalan_id, cp.partner_id from public.chalan_purchases cp where cp.deleted_at is null
  union
  select pk.chalan_id, pk.owner_partner_id from public.packets pk where pk.deleted_at is null
)
select
  pn.chalan_id,
  pn.partner_id,
  pr.name as partner_name,
  coalesce(cap.amount, 0) as capital,
  coalesce(rev.share, 0) as ext_rev,
  coalesce(ir.amount, 0) as internal_rev,
  coalesce(po.qty, 0) + coalesce(kp.qty, 0) as pcs_out,
  coalesce(cap.buy_rate, 0) * (coalesce(po.qty, 0) + coalesce(kp.qty, 0)) as cost,
  coalesce(rev.share, 0) + coalesce(ir.amount, 0) - coalesce(cap.buy_rate, 0) * (coalesce(po.qty, 0) + coalesce(kp.qty, 0)) as profit,
  coalesce(cn.amount, 0) as consumption_due,
  coalesce(ea.amount, 0) as expenses_attributed,
  coalesce(pk2.amount, 0) as pocket_paid,
  coalesce(cap.amount, 0) + coalesce(rev.share, 0) + coalesce(ir.amount, 0)
    - coalesce(cap.buy_rate, 0) * (coalesce(po.qty, 0) + coalesce(kp.qty, 0))
    - coalesce(cn.amount, 0)
    - coalesce(ea.amount, 0)
    + coalesce(pk2.amount, 0) as entitlement
from partners pn
join public.partners pr on pr.id = pn.partner_id
left join capital cap on cap.chalan_id = pn.chalan_id and cap.partner_id = pn.partner_id
left join rev on rev.chalan_id = pn.chalan_id and rev.partner_id = pn.partner_id
left join internal_rev ir on ir.chalan_id = pn.chalan_id and ir.partner_id = pn.partner_id
left join pcs_out po on po.chalan_id = pn.chalan_id and po.partner_id = pn.partner_id
left join kept kp on kp.chalan_id = pn.chalan_id and kp.partner_id = pn.partner_id
left join consumption cn on cn.chalan_id = pn.chalan_id and cn.partner_id = pn.partner_id
left join expenses_attr ea on ea.chalan_id = pn.chalan_id and ea.partner_id = pn.partner_id
left join pocket pk2 on pk2.chalan_id = pn.chalan_id and pk2.partner_id = pn.partner_id;

create or replace view public.v_partner_balance with (security_invoker = true) as
with live as (
  select s.partner_id, sum(s.entitlement) as amount
  from public.v_partner_chalan_settlement s
  join public.chalans c on c.id = s.chalan_id
  where c.status = 'open' and c.deleted_at is null
  group by s.partner_id
),
closed as (
  select (el ->> 'partner_id')::uuid as partner_id, (el ->> 'entitlement')::numeric(12,2) as amount
  from public.chalan_close_snapshots cs
  join public.chalans c on c.id = cs.chalan_id and c.deleted_at is null
  cross join lateral jsonb_array_elements(cs.data -> 'partners') el
),
charges as (
  select attributed_to_partner_id as partner_id, sum(charge) as amount
  from public.wallet_transfers where deleted_at is null
  group by attributed_to_partner_id
),
unlinked_exp as (
  select attributed_to_partner_id as partner_id, sum(amount) as amount
  from public.expenses where deleted_at is null and chalan_id is null
  group by attributed_to_partner_id
),
unlinked_pocket as (
  select paid_by_partner_id as partner_id, sum(amount) as amount
  from public.expenses where deleted_at is null and chalan_id is null and wallet_account_id is null
  group by paid_by_partner_id
),
taken as (
  select partner_id, sum(amount) as amount
  from public.withdrawals where deleted_at is null
  group by partner_id
)
select
  p.id as partner_id,
  p.name as partner_name,
  coalesce(li.amount, 0) + coalesce(cl.amount, 0)
    - coalesce(ch.amount, 0)
    - coalesce(ux.amount, 0)
    + coalesce(uxp.amount, 0)
    - coalesce(tk.amount, 0) as balance,
  coalesce(li.amount, 0) as balance_open,
  coalesce(cl.amount, 0) as balance_closed
from public.partners p
left join live li on li.partner_id = p.id
left join closed cl on cl.partner_id = p.id
left join charges ch on ch.partner_id = p.id
left join unlinked_exp ux on ux.partner_id = p.id
left join unlinked_pocket uxp on uxp.partner_id = p.id
left join taken tk on tk.partner_id = p.id
where p.deleted_at is null;

create or replace view public.v_wallet_balance with (security_invoker = true) as
select
  w.id as wallet_id,
  w.type,
  w.label,
  w.is_active,
  coalesce((select sum(s.amount_received) from public.sales s where s.wallet_account_id = w.id and s.deleted_at is null), 0)
    - coalesce((select sum(e.amount) from public.expenses e where e.wallet_account_id = w.id and e.deleted_at is null), 0)
    - coalesce((select sum(wd.amount) from public.withdrawals wd where wd.wallet_account_id = w.id and wd.deleted_at is null), 0)
    - coalesce((select sum(t.amount) from public.wallet_transfers t where t.from_wallet_id = w.id and t.deleted_at is null), 0)
    + coalesce((select sum(t.amount - t.charge) from public.wallet_transfers t where t.to_wallet_id = w.id and t.deleted_at is null), 0) as balance
from public.wallets w
where w.type = 'cash' or w.is_active
order by w.type, w.created_at;

create or replace view public.v_sales_enriched with (security_invoker = true) as
select
  s.id,
  s.sold_at,
  s.qty,
  s.list_unit_price,
  s.amount_received,
  s.discount,
  s.discount * 100.0 / nullif(s.qty * s.list_unit_price, 0) as discount_pct,
  s.customer_name,
  s.customer_phone,
  s.wallet_account_id,
  w.type as wallet_type,
  w.label as wallet_label,
  s.note,
  s.created_at,
  coalesce((select string_agg(distinct c.code || '/' || pk.code, ', ') from public.sale_allocations sa join public.packets pk on pk.id = sa.packet_id join public.chalans c on c.id = pk.chalan_id where sa.sale_id = s.id), '') as packet_codes,
  coalesce((select string_agg(distinct p.name, ', ') from public.sale_allocations sa join public.packets pk on pk.id = sa.packet_id join public.partners p on p.id = pk.owner_partner_id where sa.sale_id = s.id), '') as owner_names
from public.sales s
join public.wallets w on w.id = s.wallet_account_id
where s.deleted_at is null;

create or replace function public.dashboard_totals(
  p_start timestamptz default '-infinity'::timestamptz,
  p_end timestamptz default 'infinity'::timestamptz
)
returns table (
  income numeric,
  expenses numeric,
  discount_total numeric,
  realized_cost numeric,
  net_profit numeric,
  list_value numeric,
  cash_received numeric,
  stock_current numeric
)
language sql stable security invoker set search_path = public, extensions
as $$
  select
    (select coalesce(sum(s.amount_received), 0) from public.sales s where s.deleted_at is null and s.sold_at >= p_start and s.sold_at < p_end)
      + (select coalesce(sum(pu.qty * pu.unit_value), 0) from public.personal_uses pu where pu.deleted_at is null and pu.at >= p_start and pu.at < p_end),
    (select coalesce(sum(e.amount), 0) from public.expenses e where e.deleted_at is null and e.spent_at >= p_start and e.spent_at < p_end),
    (select coalesce(sum(s.discount), 0) from public.sales s where s.deleted_at is null and s.sold_at >= p_start and s.sold_at < p_end),
    (select coalesce(sum(sa.qty * c.buy_rate), 0) from public.sale_allocations sa join public.sales s on s.id = sa.sale_id and s.deleted_at is null and s.sold_at >= p_start and s.sold_at < p_end join public.packets pk on pk.id = sa.packet_id join public.chalans c on c.id = pk.chalan_id)
      + (select coalesce(sum(aj.qty * c.buy_rate), 0) from public.stock_adjustments aj join public.packets pk on pk.id = aj.packet_id join public.chalans c on c.id = pk.chalan_id where aj.deleted_at is null and aj.at >= p_start and aj.at < p_end)
      + (select coalesce(sum(pu.qty * c.buy_rate), 0) from public.personal_uses pu left join public.packets pk on pk.id = pu.packet_id left join public.chalans c on c.id = coalesce(pk.chalan_id, pu.chalan_id) where pu.deleted_at is null and pu.at >= p_start and pu.at < p_end),
    (select coalesce(sum(s.amount_received), 0) from public.sales s where s.deleted_at is null and s.sold_at >= p_start and s.sold_at < p_end)
      - (select coalesce(sum(sa.qty * c.buy_rate), 0) from public.sale_allocations sa join public.sales s on s.id = sa.sale_id and s.deleted_at is null and s.sold_at >= p_start and s.sold_at < p_end join public.packets pk on pk.id = sa.packet_id join public.chalans c on c.id = pk.chalan_id)
      - (select coalesce(sum(aj.qty * c.buy_rate), 0) from public.stock_adjustments aj join public.packets pk on pk.id = aj.packet_id join public.chalans c on c.id = pk.chalan_id where aj.deleted_at is null and aj.at >= p_start and aj.at < p_end)
      - (select coalesce(sum(e.amount), 0) from public.expenses e where e.deleted_at is null and e.spent_at >= p_start and e.spent_at < p_end),
    (select coalesce(sum(s.qty * s.list_unit_price), 0) from public.sales s where s.deleted_at is null and s.sold_at >= p_start and s.sold_at < p_end),
    (select coalesce(sum(s.amount_received), 0) from public.sales s where s.deleted_at is null and s.sold_at >= p_start and s.sold_at < p_end),
    (select coalesce(sum(remaining), 0) from public.v_packet_stock)
$$;

create or replace function public.income_by_period_breakdown(p_start timestamptz, p_end timestamptz)
returns table (
  slice text,
  amount numeric
)
language sql stable security definer set search_path = public, extensions
as $$
  select coalesce(w.type, 'unknown') || '|' || coalesce(w.label, '') as slice, coalesce(sum(s.amount_received), 0) as amount
  from public.sales s
  join public.wallets w on w.id = s.wallet_account_id
  where s.deleted_at is null and s.sold_at >= p_start and s.sold_at < p_end
  group by coalesce(w.type, 'unknown'), coalesce(w.label, '')
  union all
  select 'personal' as slice, coalesce(sum(pu.qty * pu.unit_value), 0) as amount
  from public.personal_uses pu
  where pu.deleted_at is null and pu.at >= p_start and pu.at < p_end
  having coalesce(sum(pu.qty * pu.unit_value), 0) <> 0
$$;

grant execute on function public.dashboard_totals(timestamptz, timestamptz) to authenticated;
grant execute on function public.income_by_period_breakdown(timestamptz, timestamptz) to authenticated;
grant execute on function public.packet_remaining(uuid) to authenticated;
grant execute on function public.create_chalan(jsonb) to authenticated;
grant execute on function public.create_packets(jsonb) to authenticated;
grant execute on function public.set_sell_priority(uuid[]) to authenticated;
grant execute on function public.create_sale(jsonb) to authenticated;
grant execute on function public.update_sale(uuid, jsonb) to authenticated;
grant execute on function public.delete_sale(uuid) to authenticated;
grant execute on function public.create_personal_use(jsonb) to authenticated;
grant execute on function public.create_adjustment(jsonb) to authenticated;
grant execute on function public.create_expense(jsonb) to authenticated;
grant execute on function public.update_expense(uuid, jsonb) to authenticated;
grant execute on function public.delete_expense(uuid) to authenticated;
grant execute on function public.create_withdrawal(jsonb) to authenticated;
grant execute on function public.create_transfer(jsonb) to authenticated;
grant execute on function public.close_chalan(uuid) to authenticated;
grant execute on function public.reopen_chalan(uuid) to authenticated;
grant execute on function public.assert_writeable() to authenticated;
grant execute on function public.server_now() to authenticated;
grant execute on function public.complete_password_change() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_su_admin() to authenticated;
grant execute on function public.password_gate() to authenticated;

grant select on public.expense_categories, public.wallets, public.chalans, public.chalan_purchases, public.packets, public.sell_priority, public.sales, public.sale_allocations, public.personal_uses, public.stock_adjustments, public.expenses, public.withdrawals, public.wallet_transfers, public.chalan_close_snapshots, public.audit_log, public.profiles, public.partners, public.settings to authenticated;

grant insert, update on public.profiles, public.partners, public.wallets, public.chalans, public.chalan_purchases, public.packets, public.personal_uses, public.stock_adjustments, public.expenses, public.withdrawals, public.wallet_transfers to authenticated;
grant update on public.settings to authenticated;

grant select on public.v_packet_stock, public.v_chalan_summary, public.v_partner_chalan_settlement, public.v_partner_balance, public.v_wallet_balance, public.v_sales_enriched to authenticated;
