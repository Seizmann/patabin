alter table public.sales add column source text not null default 'manual';
alter table public.sales add column agent_model text;
alter table public.sales add column pending_action_id uuid;

alter table public.expenses add column source text not null default 'manual';
alter table public.expenses add column agent_model text;
alter table public.expenses add column pending_action_id uuid;

alter table public.personal_uses add column source text not null default 'manual';
alter table public.personal_uses add column agent_model text;
alter table public.personal_uses add column pending_action_id uuid;

alter table public.stock_adjustments add column source text not null default 'manual';
alter table public.stock_adjustments add column agent_model text;
alter table public.stock_adjustments add column pending_action_id uuid;

create unique index sales_pending_action_key on public.sales (pending_action_id) where pending_action_id is not null;
create unique index expenses_pending_action_key on public.expenses (pending_action_id) where pending_action_id is not null;
create unique index personal_uses_pending_action_key on public.personal_uses (pending_action_id) where pending_action_id is not null;
create unique index stock_adjustments_pending_action_key on public.stock_adjustments (pending_action_id) where pending_action_id is not null;

create or replace function public.guard_agent_source() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.source = 'agent' then
    if tg_op = 'INSERT' or coalesce(old.source, 'manual') <> 'agent' then
      if coalesce(current_setting('patabin.agent_exec', true), '') <> 'on' then
        raise exception 'AGENT_EXEC_OFF';
      end if;
      if tg_op = 'INSERT' and (new.agent_model is null or new.pending_action_id is null) then
        raise exception 'AGENT_MARK_INCOMPLETE';
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger trg_agent_source_sales before insert or update on public.sales
  for each row execute function public.guard_agent_source();
create trigger trg_agent_source_expenses before insert or update on public.expenses
  for each row execute function public.guard_agent_source();
create trigger trg_agent_source_personal_uses before insert or update on public.personal_uses
  for each row execute function public.guard_agent_source();
create trigger trg_agent_source_stock_adjustments before insert or update on public.stock_adjustments
  for each row execute function public.guard_agent_source();
