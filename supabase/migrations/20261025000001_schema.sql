create extension if not exists pgcrypto with schema extensions;

create schema if not exists public;

create type public.user_role as enum ('su_admin', 'patabin_admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'patabin_admin',
  display_name text not null default '',
  password_hash_snapshot text not null default '',
  must_change_password boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_id uuid unique references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.settings (
  id smallint primary key default 1 check (id = 1),
  default_buy_rate numeric(12,2) not null default 190,
  default_sell_price numeric(12,2) not null default 300,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  purchase_date timestamptz not null default now(),
  unit_cost numeric(12,2) not null default 190,
  pcs_per_packet integer,
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz
);

create table public.batch_contributions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches (id),
  partner_id uuid not null references public.partners (id),
  qty integer not null default 0 check (qty >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz,
  unique (batch_id, partner_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches (id),
  spent_on timestamptz not null default now(),
  category text not null check (category in ('transport','packaging','other')),
  cost_type text not null check (cost_type in ('landed','operating')),
  amount numeric(12,2) not null check (amount > 0),
  paid_by_partner_id uuid references public.partners (id),
  funding text not null check (funding in ('own_pocket','sales_cash')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz
);

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches (id),
  adjusted_on timestamptz not null default now(),
  qty integer not null check (qty > 0),
  reason text not null check (reason in ('damage','loss','sample','other')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sold_at timestamptz not null default now(),
  kind text not null check (kind in ('external','internal')),
  customer_name text,
  partner_id uuid references public.partners (id),
  received_by_partner_id uuid references public.partners (id),
  qty integer not null check (qty > 0),
  list_unit_price numeric(12,2) not null check (list_unit_price >= 0),
  amount_received numeric(12,2) not null check (amount_received >= 0),
  payment_method text check (payment_method in ('cash','bkash','nagad','rocket','bank','other')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz,
  constraint sales_kind_shape check (
    (kind = 'internal' and partner_id is not null and received_by_partner_id is null)
    or
    (kind = 'external' and received_by_partner_id is not null and partner_id is null)
  )
);

create table public.sale_allocations (
  sale_id uuid not null references public.sales (id) on delete cascade,
  batch_id uuid not null references public.batches (id),
  qty integer not null check (qty > 0),
  created_at timestamptz not null default now(),
  primary key (sale_id, batch_id)
);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  transferred_on timestamptz not null default now(),
  from_partner_id uuid not null references public.partners (id),
  to_partner_id uuid not null references public.partners (id),
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'cash',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz,
  check (from_partner_id <> to_partner_id)
);

create table public.batch_close_snapshots (
  batch_id uuid primary key references public.batches (id) on delete cascade,
  closed_at timestamptz not null default now(),
  closed_by uuid,
  data jsonb not null
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('I','U','D')),
  old_data jsonb,
  new_data jsonb
);
