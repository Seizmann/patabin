create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active)
$$;

create or replace function public.is_su_admin() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'su_admin' and is_active)
$$;

create or replace function public.password_gate() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active and not must_change_password
  )
$$;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.partners enable row level security;
alter table public.partners force row level security;
alter table public.settings enable row level security;
alter table public.settings force row level security;
alter table public.batches enable row level security;
alter table public.batches force row level security;
alter table public.batch_contributions enable row level security;
alter table public.batch_contributions force row level security;
alter table public.expenses enable row level security;
alter table public.expenses force row level security;
alter table public.stock_adjustments enable row level security;
alter table public.stock_adjustments force row level security;
alter table public.sales enable row level security;
alter table public.sales force row level security;
alter table public.sale_allocations enable row level security;
alter table public.sale_allocations force row level security;
alter table public.transfers enable row level security;
alter table public.transfers force row level security;
alter table public.batch_close_snapshots enable row level security;
alter table public.batch_close_snapshots force row level security;
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

create policy profiles_select on public.profiles for select to authenticated using (is_active_user());
create policy profiles_update on public.profiles for update to authenticated using (is_active_user() and password_gate()) with check (is_active_user() and password_gate());

create policy partners_select on public.partners for select to authenticated using (is_active_user());
create policy partners_insert on public.partners for insert to authenticated with check (is_active_user() and password_gate());
create policy partners_update on public.partners for update to authenticated using (is_active_user() and password_gate()) with check (is_active_user() and password_gate());

create policy settings_select on public.settings for select to authenticated using (is_active_user());
create policy settings_update on public.settings for update to authenticated using (is_su_admin()) with check (is_su_admin());

create policy batches_select on public.batches for select to authenticated using (is_active_user());
create policy batches_insert on public.batches for insert to authenticated with check (is_active_user() and password_gate());
create policy batches_update on public.batches for update to authenticated using (is_active_user() and password_gate()) with check (is_active_user() and password_gate());

create policy contributions_select on public.batch_contributions for select to authenticated using (is_active_user());
create policy contributions_insert on public.batch_contributions for insert to authenticated with check (is_active_user() and password_gate());
create policy contributions_update on public.batch_contributions for update to authenticated using (is_active_user() and password_gate()) with check (is_active_user() and password_gate());

create policy expenses_select on public.expenses for select to authenticated using (is_active_user());
create policy expenses_insert on public.expenses for insert to authenticated with check (is_active_user() and password_gate());
create policy expenses_update on public.expenses for update to authenticated using (is_active_user() and password_gate()) with check (is_active_user() and password_gate());

create policy adjustments_select on public.stock_adjustments for select to authenticated using (is_active_user());
create policy adjustments_insert on public.stock_adjustments for insert to authenticated with check (is_active_user() and password_gate());
create policy adjustments_update on public.stock_adjustments for update to authenticated using (is_active_user() and password_gate()) with check (is_active_user() and password_gate());

create policy sales_select on public.sales for select to authenticated using (is_active_user());

create policy allocations_select on public.sale_allocations for select to authenticated using (is_active_user());

create policy transfers_select on public.transfers for select to authenticated using (is_active_user());
create policy transfers_insert on public.transfers for insert to authenticated with check (is_active_user() and password_gate());
create policy transfers_update on public.transfers for update to authenticated using (is_active_user() and password_gate()) with check (is_active_user() and password_gate());

create policy snapshots_select on public.batch_close_snapshots for select to authenticated using (is_active_user());

create policy audit_select on public.audit_log for select to authenticated using (is_active_user());

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all functions in schema public from public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on functions from public;
alter default privileges in schema public revoke all on tables from public;

grant usage on schema public to authenticated;
grant select on public.profiles, public.partners, public.settings, public.batches, public.batch_contributions, public.expenses, public.stock_adjustments, public.sales, public.sale_allocations, public.transfers, public.batch_close_snapshots, public.audit_log to authenticated;
grant insert, update on public.profiles, public.partners, public.settings, public.batches, public.batch_contributions, public.expenses, public.stock_adjustments, public.transfers to authenticated;
