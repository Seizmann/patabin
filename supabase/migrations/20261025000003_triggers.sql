create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.partners for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.settings for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.batches for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.batch_contributions for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.expenses for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.stock_adjustments for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.sales for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.transfers for each row execute function public.set_updated_at();

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_row_id uuid;
begin
  if tg_table_name <> 'settings' then
    v_row_id := coalesce((to_jsonb(new) ->> 'id')::uuid, (to_jsonb(old) ->> 'id')::uuid);
  end if;
  insert into public.audit_log (user_id, table_name, row_id, action, old_data, new_data)
  values (
    auth.uid(),
    tg_table_name,
    v_row_id,
    left(tg_op, 1),
    nullif(to_jsonb(old), 'null'::jsonb),
    nullif(to_jsonb(new), 'null'::jsonb)
  );
  return coalesce(new, old);
end $$;

create trigger trg_audit after insert or update or delete on public.profiles for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.partners for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.settings for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.batches for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.batch_contributions for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.expenses for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.stock_adjustments for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.sales for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.transfers for each row execute function public.audit_row();
create trigger trg_audit after insert or update or delete on public.batch_close_snapshots for each row execute function public.audit_row();

create or replace function public.guard_closed_batch() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_batch_id uuid := coalesce(new.batch_id, old.batch_id);
  v_status text;
begin
  if tg_op = 'DELETE' then
    if tg_table_name = 'sale_allocations' and exists (select 1 from public.sales where id = old.sale_id and deleted_at is not null) then
      return old;
    end if;
    raise exception 'BATCH_CLOSED';
  end if;
  select status into v_status from public.batches where id = v_batch_id;
  if v_status = 'closed' then
    raise exception 'BATCH_CLOSED';
  end if;
  return new;
end $$;

create trigger trg_guard_closed before insert or update or delete on public.batch_contributions for each row execute function public.guard_closed_batch();
create trigger trg_guard_closed before insert or update or delete on public.expenses for each row execute function public.guard_closed_batch();
create trigger trg_guard_closed before insert or update or delete on public.stock_adjustments for each row execute function public.guard_closed_batch();
create trigger trg_guard_closed before update or delete on public.sale_allocations for each row execute function public.guard_closed_batch();

create or replace function public.guard_sales() returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_batch_id uuid;
begin
  if tg_op in ('UPDATE') and (new.deleted_at is null) then
    select sa.batch_id into v_batch_id from public.sale_allocations sa where sa.sale_id = new.id limit 1;
    if v_batch_id is not null then
      if exists (select 1 from public.batches where id in (select batch_id from public.sale_allocations where sale_id = new.id) and status = 'closed') then
        raise exception 'BATCH_CLOSED';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then raise exception 'HARD_DELETE_BLOCKED'; end if;
  return new;
end $$;

create trigger trg_guard_sales before update or delete on public.sales for each row execute function public.guard_sales();

create or replace function public.guard_profiles() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_is_su boolean;
begin
  if v_caller is null then
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

create trigger trg_guard_profiles before update on public.profiles for each row execute function public.guard_profiles();

create or replace function public.on_password_changed() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.profiles
  set must_change_password = false, password_hash_snapshot = new.encrypted_password
  where id = new.id and must_change_password;
  return new;
end $$;

create trigger trg_password_changed after update of encrypted_password on auth.users
for each row execute function public.on_password_changed();
