-- DB-driven module permissions.
--
-- Model: permissions catalog + role defaults (role_permissions) + per-user
-- overrides (profile_permissions). super admin bypasses everything and is the
-- only one who may edit overrides (users management and settings stay
-- su_admin-only and are NOT part of the delegate-able catalog).
--
-- Enforcement:
--   - write RPCs: assert_writeable('<perm>') (bodies re-created below)
--   - direct table writes: RLS write policies use can_write() and has_permission()
--   - read access unchanged: every active user sees everything

-- ---------------------------------------------------------------------------
-- Tables + seed
-- ---------------------------------------------------------------------------

create table public.permissions (
  key text primary key,
  label_bn text not null,
  sort int not null default 0
);

create table public.role_permissions (
  role public.user_role not null,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role, permission_key)
);

create table public.profile_permissions (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  allowed boolean not null,
  primary key (profile_id, permission_key)
);

insert into public.permissions (key, label_bn, sort) values
  ('sales', 'বিক্রি', 1),
  ('chalans', 'চালান ও প্যাকিং', 2),
  ('packets', 'প্যাকেট', 3),
  ('customers', 'কাস্টমার', 4),
  ('expenses', 'খরচ', 5),
  ('adjustments', 'সমন্বয়', 6),
  ('wallets', 'ওয়ালেট', 7),
  ('personal_use', 'ব্যক্তিগত ব্যবহার', 8);

-- role defaults: su_admin and patabin_admin can write everything,
-- patabin_partner nothing (matches the previous read-only partner model).
insert into public.role_permissions (role, permission_key)
select r.role::public.user_role, p.key
from (values ('su_admin'), ('patabin_admin')) as r(role)
cross join public.permissions p;

-- ---------------------------------------------------------------------------
-- RLS + grants + audit for the new tables
-- ---------------------------------------------------------------------------

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profile_permissions enable row level security;

create policy permissions_select on public.permissions for select to authenticated using (is_active_user());
create policy role_perms_select on public.role_permissions for select to authenticated using (is_active_user());
create policy profile_perms_select on public.profile_permissions for select to authenticated using (is_active_user());
create policy profile_perms_write on public.profile_permissions for all to authenticated
  using (is_su_admin()) with check (is_su_admin());

grant select on public.permissions, public.role_permissions, public.profile_permissions to authenticated;
grant insert, update, delete on public.profile_permissions to authenticated;

create trigger trg_audit_permissions after insert or update or delete on public.permissions
  for each row execute function public.audit_row();
create trigger trg_audit_role_permissions after insert or update or delete on public.role_permissions
  for each row execute function public.audit_row();
create trigger trg_audit_profile_permissions after insert or update or delete on public.profile_permissions
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.has_permission(p_key text) returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_role public.user_role;
  v_override boolean;
begin
  if not coalesce(public.is_active_user(), false) then
    return false;
  end if;
  if public.is_su_admin() then
    return true;
  end if;
  if not coalesce(public.password_gate(), false) then
    return false;
  end if;
  select role into v_role from public.profiles where id = auth.uid();
  select allowed into v_override
  from public.profile_permissions
  where profile_id = auth.uid() and permission_key = p_key;
  if v_override is not null then
    return v_override;
  end if;
  return exists (
    select 1 from public.role_permissions
    where role = v_role and permission_key = p_key
  );
end $$;

create or replace function public.my_permissions() returns text[]
language sql stable security definer set search_path = public
as $$
  select case
    when public.is_su_admin() then
      (select coalesce(array_agg(key order by sort), '{}') from public.permissions)
    else
      coalesce((
        select array_agg(k order by k)
        from (
          select pp.permission_key as k
          from public.profile_permissions pp
          where pp.profile_id = auth.uid() and pp.allowed
          union
          select rp.permission_key
          from public.role_permissions rp
          join public.profiles pr on pr.id = auth.uid() and rp.role = pr.role
          where not exists (
            select 1 from public.profile_permissions x
            where x.profile_id = auth.uid() and x.permission_key = rp.permission_key
          )
        ) t
      ), '{}')
  end;
$$;

create or replace function public.assert_writeable(p_perm text default null) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not coalesce(public.is_active_user(), false) then
    raise exception 'NOT_ACTIVE';
  end if;
  if not coalesce(public.password_gate(), false) then
    raise exception 'CHANGE_PASSWORD_REQUIRED';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and role = 'patabin_partner') then
    raise exception 'PARTNER_READ_ONLY';
  end if;
  if p_perm is not null and not coalesce(public.has_permission(p_perm), false) then
    raise exception 'PERMISSION_DENIED';
  end if;
end $$;

grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.my_permissions() to authenticated;
grant execute on function public.assert_writeable(text) to authenticated;

-- ===========================================================================
-- Write RPCs re-created with module permission checks (bodies from pg_proc,
-- only the assert_writeable() call changed to assert_writeable('<perm>')).
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.adjust_chalan_purchase(p_chalan_id uuid, p_partner_id uuid, p_delta integer, p_packets jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform public.assert_writeable('chalans');

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
end $function$
;

CREATE OR REPLACE FUNCTION public.close_chalan(p_chalan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_remaining numeric;
  v_summary record;
  v_partners jsonb;
  v_wallets jsonb;
begin
  perform public.assert_writeable('chalans');
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
    'wallet_id', w.wallet_id,
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
end $function$
;

CREATE OR REPLACE FUNCTION public.create_adjustment(p_adj jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_packet uuid := (p_adj ->> 'packet_id')::uuid;
  v_qty integer := (p_adj ->> 'qty')::integer;
begin
  perform public.assert_writeable('adjustments');
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
end $function$
;

CREATE OR REPLACE FUNCTION public.create_chalan(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_code text;
  v_next integer;
  v_rate numeric;
  v_size integer;
  r jsonb;
begin
  perform public.assert_writeable('chalans');
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
end $function$
;

CREATE OR REPLACE FUNCTION public.create_customer_payment(p_pay jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_customer uuid := (p_pay ->> 'customer_id')::uuid;
  v_amount numeric := (p_pay ->> 'amount')::numeric;
  v_left numeric;
  v_take numeric;
  v_total_qty numeric;
  v_alloc_sum numeric;
  v_part numeric;
  v_cnt integer;
  v_i integer;
  r record;
  a record;
begin
  perform public.assert_writeable('customers');
  if v_amount is null or v_amount <= 0
    or not exists (select 1 from public.customers where id = v_customer and deleted_at is null)
    or not exists (select 1 from public.wallets where id = (p_pay ->> 'wallet_account_id')::uuid and is_active) then
    raise exception 'PAYMENT_INVALID';
  end if;
  insert into public.customer_payments (customer_id, amount, wallet_account_id, at, note, created_by)
  values (
    v_customer,
    v_amount,
    (p_pay ->> 'wallet_account_id')::uuid,
    coalesce((p_pay ->> 'at')::timestamptz, now()),
    nullif(p_pay ->> 'note', ''),
    auth.uid()
  ) returning id into v_id;
  v_left := v_amount;
  for r in
    select s.id,
      s.due_amount - coalesce((
        select sum(cpa.amount)
        from public.customer_payment_allocations cpa
        join public.customer_payments cp on cp.id = cpa.payment_id
        where cpa.sale_id = s.id and cp.deleted_at is null
      ), 0) as due
    from public.sales s
    where s.customer_id = v_customer
      and s.deleted_at is null
      and s.due_amount > 0
      and exists (select 1 from public.sale_allocations sa where sa.sale_id = s.id)
    order by s.sold_at, s.created_at
  loop
    exit when v_left <= 0;
    v_take := least(v_left, greatest(r.due, 0));
    if v_take > 0 then
      select coalesce(sum(sa.qty), 0), count(*) into v_total_qty, v_cnt
      from public.sale_allocations sa where sa.sale_id = r.id;
      if v_cnt > 0 and v_total_qty > 0 then
        v_alloc_sum := 0;
        v_i := 0;
        for a in
          select sa.packet_id, sa.qty from public.sale_allocations sa
          where sa.sale_id = r.id order by sa.packet_id
        loop
          v_i := v_i + 1;
          if v_i = v_cnt then
            v_part := round(v_take - v_alloc_sum, 2);
          else
            v_part := round(v_take * a.qty / v_total_qty, 2);
          end if;
          if v_part > 0 then
            insert into public.customer_payment_allocations (payment_id, sale_id, packet_id, amount)
            values (v_id, r.id, a.packet_id, v_part);
            v_alloc_sum := v_alloc_sum + v_part;
          end if;
        end loop;
      end if;
    end if;
    v_left := v_left - v_take;
  end loop;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.create_expense(p_exp jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_wallet uuid := (p_exp ->> 'wallet_account_id')::uuid;
begin
  perform public.assert_writeable('expenses');
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
end $function$
;

CREATE OR REPLACE FUNCTION public.create_packets(p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.create_personal_use(p_use jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_packet uuid := (p_use ->> 'packet_id')::uuid;
  v_qty integer := (p_use ->> 'qty')::integer;
  v_value numeric := coalesce((p_use ->> 'unit_value')::numeric, (select default_sell_price from public.settings where id = 1));
  v_chalan uuid;
begin
  perform public.assert_writeable('personal_use');
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
end $function$
;

CREATE OR REPLACE FUNCTION public.create_sale(p_sale jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform public.assert_writeable('sales');
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
  if jsonb_typeof(p_sale -> 'allocations') = 'array' then
    if (
      select sum((x ->> 'qty')::numeric)
      from jsonb_array_elements(p_sale -> 'allocations') x
      where (x ->> 'packet_id') is not null and (x ->> 'qty')::numeric is not null and (x ->> 'qty')::numeric > 0
    ) <> v_qty
    or exists (
      select 1 from jsonb_array_elements(p_sale -> 'allocations') x
      where (x ->> 'packet_id') is null or (x ->> 'qty')::numeric is null or (x ->> 'qty')::numeric <= 0
    ) then
      raise exception 'ALLOC_MISMATCH';
    end if;
    for r in
      select (x ->> 'packet_id')::uuid as pid, sum((x ->> 'qty')::numeric) as q
      from jsonb_array_elements(p_sale -> 'allocations') x
      group by 1
    loop
      if not exists (
        select 1 from public.packets pk join public.chalans c on c.id = pk.chalan_id
        where pk.id = r.pid and pk.deleted_at is null and c.deleted_at is null and c.status = 'open'
      ) then
        raise exception 'PACKET_NOT_FOUND';
      end if;
      if r.q > public.packet_remaining(r.pid) then
        raise exception 'NO_STOCK';
      end if;
    end loop;
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
  if jsonb_typeof(p_sale -> 'allocations') = 'array' then
    for r in
      select (x ->> 'packet_id')::uuid as pid, sum((x ->> 'qty')::numeric) as q
      from jsonb_array_elements(p_sale -> 'allocations') x
      group by 1
    loop
      insert into public.sale_allocations (sale_id, packet_id, qty) values (v_id, r.pid, r.q);
    end loop;
  else
    perform public.allocate_by_priority(v_id, v_qty);
  end if;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.create_transfer(p_t jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_from uuid := (p_t ->> 'from_wallet_id')::uuid;
  v_to uuid := (p_t ->> 'to_wallet_id')::uuid;
  v_type_from text;
  v_type_to text;
  v_charge numeric := coalesce((p_t ->> 'charge')::numeric, 0);
begin
  perform public.assert_writeable('wallets');
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
end $function$
;

CREATE OR REPLACE FUNCTION public.create_withdrawal(p_w jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_wallet uuid := (p_w ->> 'wallet_account_id')::uuid;
  v_partner uuid := (p_w ->> 'partner_id')::uuid;
  v_amount numeric := (p_w ->> 'amount')::numeric;
  v_balance numeric(12,2);
begin
  perform public.assert_writeable('wallets');
  if v_amount is null or v_amount <= 0
    or not exists (select 1 from public.partners where id = v_partner and deleted_at is null)
    or not exists (select 1 from public.wallets where id = v_wallet and is_active) then
    raise exception 'WITHDRAWAL_INVALID';
  end if;

  if exists (select 1 from public.chalans where status = 'open' and deleted_at is null) then
    raise exception 'WITHDRAWAL_CHALAN_OPEN';
  end if;

  select coalesce(li.amount, 0) + coalesce(cl.amount, 0) - coalesce(ch.amount, 0)
         - coalesce(ux.amount, 0) + coalesce(uxp.amount, 0) - coalesce(tk.amount, 0)
  into v_balance
  from public.partners p
  left join (select s.partner_id, sum(s.entitlement) as amount
             from public.v_partner_chalan_settlement s
             join public.chalans c on c.id = s.chalan_id
             where c.status = 'open' and c.deleted_at is null
             group by s.partner_id) li on li.partner_id = v_partner
  left join (select (el.value ->> 'partner_id')::uuid as partner_id,
                    sum((el.value ->> 'entitlement')::numeric(12,2)) as amount
             from public.chalan_close_snapshots cs
             join public.chalans c on c.id = cs.chalan_id and c.deleted_at is null
             cross join lateral jsonb_array_elements(cs.data -> 'partners') el(value)
             group by 1) cl on cl.partner_id = v_partner
  left join (select wallet_transfers.attributed_to_partner_id as partner_id, sum(wallet_transfers.charge) as amount
             from public.wallet_transfers where wallet_transfers.deleted_at is null group by 1) ch on ch.partner_id = v_partner
  left join (select expenses.attributed_to_partner_id as partner_id, sum(expenses.amount) as amount
             from public.expenses where expenses.deleted_at is null and expenses.chalan_id is null group by 1) ux on ux.partner_id = v_partner
  left join (select expenses.paid_by_partner_id as partner_id, sum(expenses.amount) as amount
             from public.expenses where expenses.deleted_at is null and expenses.chalan_id is null and expenses.wallet_account_id is null group by 1) uxp on uxp.partner_id = v_partner
  left join (select withdrawals.partner_id, sum(withdrawals.amount) as amount
             from public.withdrawals where withdrawals.deleted_at is null group by 1) tk on tk.partner_id = v_partner
  where p.id = v_partner;

  if v_amount > coalesce(v_balance, 0) then
    raise exception 'WITHDRAWAL_EXCEEDS_BALANCE';
  end if;

  insert into public.withdrawals (at, partner_id, wallet_account_id, amount, note, created_by)
  values (
    coalesce((p_w ->> 'at')::timestamptz, now()),
    v_partner,
    v_wallet,
    v_amount,
    nullif(p_w ->> 'note', ''),
    auth.uid()
  ) returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.delete_expense(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.assert_writeable('expenses');
  if exists (
    select 1 from public.expenses e
    join public.chalans c on c.id = e.chalan_id
    where e.id = p_id and (c.status = 'closed' or c.deleted_at is not null)
  ) then
    raise exception 'CHALAN_CLOSED';
  end if;
  update public.expenses set deleted_at = now() where id = p_id and deleted_at is null;
end $function$
;

CREATE OR REPLACE FUNCTION public.delete_sale(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.assert_writeable('sales');
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
end $function$
;

CREATE OR REPLACE FUNCTION public.reopen_chalan(p_chalan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.assert_writeable('chalans');
  if not exists (select 1 from public.chalans where id = p_chalan_id and status = 'closed' and deleted_at is null) then
    raise exception 'CHALAN_NOT_CLOSED';
  end if;
  delete from public.chalan_close_snapshots where chalan_id = p_chalan_id;
  update public.chalans set status = 'open', closed_at = null, closed_by = null where id = p_chalan_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_sell_priority(p_ordered uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_i integer := 0;
begin
  perform public.assert_writeable('chalans');
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
end $function$
;

CREATE OR REPLACE FUNCTION public.update_expense(p_id uuid, p_exp jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old public.expenses;
  v_wallet uuid := (p_exp ->> 'wallet_account_id')::uuid;
begin
  perform public.assert_writeable('expenses');
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
end $function$
;

CREATE OR REPLACE FUNCTION public.update_sale(p_id uuid, p_sale jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform public.assert_writeable('sales');
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
  if jsonb_typeof(p_sale -> 'allocations') = 'array' then
    if (
      select sum((x ->> 'qty')::numeric)
      from jsonb_array_elements(p_sale -> 'allocations') x
      where (x ->> 'packet_id') is not null and (x ->> 'qty')::numeric is not null and (x ->> 'qty')::numeric > 0
    ) <> v_qty
    or exists (
      select 1 from jsonb_array_elements(p_sale -> 'allocations') x
      where (x ->> 'packet_id') is null or (x ->> 'qty')::numeric is null or (x ->> 'qty')::numeric <= 0
    ) then
      raise exception 'ALLOC_MISMATCH';
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
  if jsonb_typeof(p_sale -> 'allocations') = 'array' then
    for r in
      select (x ->> 'packet_id')::uuid as pid, sum((x ->> 'qty')::numeric) as q
      from jsonb_array_elements(p_sale -> 'allocations') x
      group by 1
    loop
      if not exists (
        select 1 from public.packets pk join public.chalans c on c.id = pk.chalan_id
        where pk.id = r.pid and pk.deleted_at is null and c.deleted_at is null and c.status = 'open'
      ) then
        raise exception 'PACKET_NOT_FOUND';
      end if;
      if r.q > public.packet_remaining(r.pid) then
        raise exception 'NO_STOCK';
      end if;
    end loop;
    for r in
      select (x ->> 'packet_id')::uuid as pid, sum((x ->> 'qty')::numeric) as q
      from jsonb_array_elements(p_sale -> 'allocations') x
      group by 1
    loop
      insert into public.sale_allocations (sale_id, packet_id, qty) values (p_id, r.pid, r.q);
    end loop;
  else
    perform public.allocate_by_priority(p_id, v_qty);
  end if;
end $function$
;


-- ---------------------------------------------------------------------------
-- RLS write policies: add module permission checks to direct table writes.
-- profiles and partners stay on plain can_write().
-- ---------------------------------------------------------------------------

drop policy if exists chalans_write on public.chalans;
create policy chalans_write on public.chalans for insert to authenticated
  with check (can_write() and has_permission('chalans'));
drop policy if exists chalans_update on public.chalans;
create policy chalans_update on public.chalans for update to authenticated
  using (can_write() and has_permission('chalans')) with check (can_write() and has_permission('chalans'));

drop policy if exists purchases_write on public.chalan_purchases;
create policy purchases_write on public.chalan_purchases for insert to authenticated
  with check (can_write() and has_permission('chalans'));
drop policy if exists purchases_update on public.chalan_purchases;
create policy purchases_update on public.chalan_purchases for update to authenticated
  using (can_write() and has_permission('chalans')) with check (can_write() and has_permission('chalans'));

drop policy if exists packets_write on public.packets;
create policy packets_write on public.packets for insert to authenticated
  with check (can_write() and has_permission('packets'));
drop policy if exists packets_update on public.packets;
create policy packets_update on public.packets for update to authenticated
  using (can_write() and has_permission('packets')) with check (can_write() and has_permission('packets'));

drop policy if exists personal_write on public.personal_uses;
create policy personal_write on public.personal_uses for insert to authenticated
  with check (can_write() and has_permission('personal_use'));
drop policy if exists personal_update on public.personal_uses;
create policy personal_update on public.personal_uses for update to authenticated
  using (can_write() and has_permission('personal_use')) with check (can_write() and has_permission('personal_use'));

drop policy if exists adjustments_write on public.stock_adjustments;
create policy adjustments_write on public.stock_adjustments for insert to authenticated
  with check (can_write() and has_permission('adjustments'));
drop policy if exists adjustments_update on public.stock_adjustments;
create policy adjustments_update on public.stock_adjustments for update to authenticated
  using (can_write() and has_permission('adjustments')) with check (can_write() and has_permission('adjustments'));

drop policy if exists expenses_write on public.expenses;
create policy expenses_write on public.expenses for insert to authenticated
  with check (can_write() and has_permission('expenses'));
drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses for update to authenticated
  using (can_write() and has_permission('expenses')) with check (can_write() and has_permission('expenses'));

drop policy if exists wallets_write on public.wallets;
create policy wallets_write on public.wallets for insert to authenticated
  with check (can_write() and has_permission('wallets'));
drop policy if exists wallets_update on public.wallets;
create policy wallets_update on public.wallets for update to authenticated
  using (can_write() and has_permission('wallets')) with check (can_write() and has_permission('wallets'));

drop policy if exists withdrawals_write on public.withdrawals;
create policy withdrawals_write on public.withdrawals for insert to authenticated
  with check (can_write() and has_permission('wallets'));
drop policy if exists withdrawals_update on public.withdrawals;
create policy withdrawals_update on public.withdrawals for update to authenticated
  using (can_write() and has_permission('wallets')) with check (can_write() and has_permission('wallets'));

drop policy if exists transfers_write on public.wallet_transfers;
create policy transfers_write on public.wallet_transfers for insert to authenticated
  with check (can_write() and has_permission('wallets'));
drop policy if exists transfers_update on public.wallet_transfers;
create policy transfers_update on public.wallet_transfers for update to authenticated
  using (can_write() and has_permission('wallets')) with check (can_write() and has_permission('wallets'));

drop policy if exists customers_write on public.customers;
create policy customers_write on public.customers for insert to authenticated
  with check (can_write() and has_permission('customers'));
drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers for update to authenticated
  using (can_write() and has_permission('customers')) with check (can_write() and has_permission('customers'));

drop policy if exists payments_write on public.customer_payments;
create policy payments_write on public.customer_payments for insert to authenticated
  with check (can_write() and has_permission('customers'));
drop policy if exists payments_update on public.customer_payments;
create policy payments_update on public.customer_payments for update to authenticated
  using (can_write() and has_permission('customers')) with check (can_write() and has_permission('customers'));

-- ---------------------------------------------------------------------------
-- Realtime: propagate permission/role changes to connected clients
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'profile_permissions', 'role_permissions']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
