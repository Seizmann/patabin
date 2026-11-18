alter table public.agent_conversations add column if not exists updated_at timestamptz not null default now();
