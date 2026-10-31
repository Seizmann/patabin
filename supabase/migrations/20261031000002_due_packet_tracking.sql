-- track customer due payments down to the packet they came from
create table if not exists public.customer_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.customer_payments (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete cascade,
  packet_id uuid not null references public.packets (id),
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists customer_payment_allocations_payment_idx on public.customer_payment_allocations (payment_id);
create index if not exists customer_payment_allocations_sale_idx on public.customer_payment_allocations (sale_id);
create index if not exists customer_payment_allocations_packet_idx on public.customer_payment_allocations (packet_id);

alter table public.customer_payment_allocations enable row level security;
alter table public.customer_payment_allocations force row level security;

drop policy if exists payment_allocations_select on public.customer_payment_allocations;
create policy payment_allocations_select on public.customer_payment_allocations for select to authenticated using (is_active_user());

revoke all on public.customer_payment_allocations from anon, authenticated;
grant select on public.customer_payment_allocations to authenticated;

drop trigger if exists trg_audit on public.customer_payment_allocations;
create trigger trg_audit after insert or update or delete on public.customer_payment_allocations for each row execute function public.audit_row();

-- payment goes to the oldest outstanding due first, and each sale's due is split
-- across its packets by allocated quantity (last packet takes the rounding remainder)
create or replace function public.create_customer_payment(p_pay jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
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
  perform public.assert_writeable();
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
end $$;

grant execute on function public.create_customer_payment(jsonb) to authenticated;
