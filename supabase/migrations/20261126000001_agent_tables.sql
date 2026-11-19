create table public.agent_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_url text not null check (base_url = rtrim(base_url, '/')),
  vault_secret_id uuid,
  key_last4 text,
  extra_headers jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.agent_models (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.agent_providers(id) on delete cascade,
  model_id text not null,
  display_name text not null,
  supports_tools boolean not null default false,
  supports_streaming boolean not null default true,
  is_active boolean not null default true,
  fallback_position integer,
  is_default boolean not null default false,
  max_output_tokens integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (provider_id, model_id)
);

create unique index agent_models_one_default on public.agent_models (is_default) where is_default;
create index agent_models_fallback on public.agent_models (fallback_position) where fallback_position is not null;

create table public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
  seq bigint not null,
  role text not null check (role in ('user', 'assistant', 'tool', 'event')),
  content text,
  tool_calls jsonb,
  tool_call_id text,
  tool_name text,
  model_id text,
  provider_id uuid,
  usage jsonb,
  event jsonb,
  created_at timestamptz not null default now(),
  unique (conversation_id, seq)
);

create table public.agent_pending_actions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.agent_conversations(id) on delete set null,
  message_id uuid references public.agent_messages(id) on delete set null,
  tool text not null check (tool in ('propose_sale', 'propose_expense', 'propose_personal_use', 'propose_adjustment')),
  payload jsonb not null,
  defaults_used text[] not null default '{}',
  preview jsonb,
  payload_hash text not null,
  preview_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'executed', 'rejected', 'expired', 'failed', 'stale')),
  model_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  decided_at timestamptz,
  decided_by uuid,
  result_table text,
  result_id uuid,
  error text
);

create index agent_pending_actions_status on public.agent_pending_actions (status) where status = 'pending';
create index agent_pending_actions_conversation on public.agent_pending_actions (conversation_id);
create index agent_messages_conversation on public.agent_messages (conversation_id, created_at);
create index agent_conversations_owner on public.agent_conversations (owner_id, last_activity_at);

alter table public.agent_providers enable row level security;
alter table public.agent_providers force row level security;
alter table public.agent_models enable row level security;
alter table public.agent_models force row level security;
alter table public.agent_conversations enable row level security;
alter table public.agent_conversations force row level security;
alter table public.agent_messages enable row level security;
alter table public.agent_messages force row level security;
alter table public.agent_pending_actions enable row level security;
alter table public.agent_pending_actions force row level security;

create policy agent_providers_all on public.agent_providers
  for all to authenticated using (public.is_su_admin() and public.is_active_user())
  with check (public.is_su_admin() and public.is_active_user());
create policy agent_models_all on public.agent_models
  for all to authenticated using (public.is_su_admin() and public.is_active_user())
  with check (public.is_su_admin() and public.is_active_user());
create policy agent_conversations_read on public.agent_conversations
  for select to authenticated using (owner_id = auth.uid() or public.is_su_admin());
create policy agent_conversations_write on public.agent_conversations
  for insert to authenticated with check (owner_id = auth.uid());
create policy agent_conversations_update on public.agent_conversations
  for update to authenticated using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
create policy agent_conversations_delete on public.agent_conversations
  for delete to authenticated using (owner_id = auth.uid());
create policy agent_messages_read on public.agent_messages
  for select to authenticated using (
    exists (select 1 from public.agent_conversations c where c.id = conversation_id and (c.owner_id = auth.uid() or public.is_su_admin()))
  );
create policy agent_messages_insert on public.agent_messages
  for insert to authenticated with check (
    exists (select 1 from public.agent_conversations c where c.id = conversation_id and c.owner_id = auth.uid())
  );
create policy agent_pending_actions_read on public.agent_pending_actions
  for select to authenticated using (public.is_su_admin() and public.is_active_user());

revoke all on public.agent_providers from anon, authenticated;
revoke all on public.agent_models from anon, authenticated;
revoke all on public.agent_conversations from anon, authenticated;
revoke all on public.agent_messages from anon, authenticated;
revoke all on public.agent_pending_actions from anon, authenticated;

grant select, insert, update on public.agent_providers to authenticated;
grant select, insert, update on public.agent_models to authenticated;
grant select, insert, update, delete on public.agent_conversations to authenticated;
grant select, insert on public.agent_messages to authenticated;
grant select on public.agent_pending_actions to authenticated;

alter table public.sales add constraint sales_pending_action_fkey
  foreign key (pending_action_id) references public.agent_pending_actions(id) on delete set null;
alter table public.expenses add constraint expenses_pending_action_fkey
  foreign key (pending_action_id) references public.agent_pending_actions(id) on delete set null;
alter table public.personal_uses add constraint personal_uses_pending_action_fkey
  foreign key (pending_action_id) references public.agent_pending_actions(id) on delete set null;
alter table public.stock_adjustments add constraint stock_adjustments_pending_action_fkey
  foreign key (pending_action_id) references public.agent_pending_actions(id) on delete set null;

create trigger trg_updated_at_agent_providers before update on public.agent_providers
  for each row execute function public.set_updated_at();
create trigger trg_updated_at_agent_models before update on public.agent_models
  for each row execute function public.set_updated_at();
create trigger trg_updated_at_agent_conversations before update on public.agent_conversations
  for each row execute function public.set_updated_at();

create trigger trg_audit_agent_providers after insert or update or delete on public.agent_providers
  for each row execute function public.audit_row();
create trigger trg_audit_agent_models after insert or update or delete on public.agent_models
  for each row execute function public.audit_row();
create trigger trg_audit_agent_pending_actions after insert or update or delete on public.agent_pending_actions
  for each row execute function public.audit_row();
