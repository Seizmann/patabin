create extension if not exists supabase_vault;

create or replace function public.agent_assert_allowed() returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_active_user() or not public.is_su_admin() then
    raise exception 'AGENT_FORBIDDEN';
  end if;
end $$;

create or replace function public.agent_set_provider_key(p_provider_id uuid, p_key text)
returns void
language plpgsql security definer set search_path = public, vault
as $$
declare
  v_secret uuid;
begin
  perform public.agent_assert_allowed();
  if p_key is null or length(trim(p_key)) < 8 then
    raise exception 'AGENT_KEY_INVALID';
  end if;
  select vault_secret_id into v_secret from public.agent_providers where id = p_provider_id;
  if v_secret is null then
    if not exists (select 1 from public.agent_providers where id = p_provider_id) then
      raise exception 'AGENT_PROVIDER_NOT_FOUND';
    end if;
    v_secret := vault.create_secret(trim(p_key), 'agent_provider_' || p_provider_id::text);
  else
    perform vault.update_secret(v_secret, trim(p_key));
  end if;
  update public.agent_providers
    set vault_secret_id = v_secret, key_last4 = right(trim(p_key), 4)
  where id = p_provider_id;
end $$;

create or replace function public.agent_get_provider_key(p_provider_id uuid)
returns text
language plpgsql security definer set search_path = public, vault
as $$
declare
  v_secret uuid;
  v_key text;
begin
  perform public.agent_assert_allowed();
  select vault_secret_id into v_secret from public.agent_providers where id = p_provider_id;
  if v_secret is null then
    raise exception 'AGENT_KEY_NOT_SET';
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where id = v_secret;
  if v_key is null then
    raise exception 'AGENT_KEY_NOT_SET';
  end if;
  return v_key;
end $$;

create or replace function public.agent_clear_provider_key(p_provider_id uuid)
returns void
language plpgsql security definer set search_path = public, vault
as $$
declare
  v_secret uuid;
begin
  perform public.agent_assert_allowed();
  select vault_secret_id into v_secret from public.agent_providers where id = p_provider_id;
  update public.agent_providers set vault_secret_id = null, key_last4 = null where id = p_provider_id;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
end $$;

revoke execute on function public.agent_assert_allowed() from public, anon, authenticated;
revoke execute on function public.agent_set_provider_key(uuid, text) from public, anon, authenticated;
revoke execute on function public.agent_get_provider_key(uuid) from public, anon, authenticated;
revoke execute on function public.agent_clear_provider_key(uuid) from public, anon, authenticated;
grant execute on function public.agent_set_provider_key(uuid, text) to authenticated;
grant execute on function public.agent_get_provider_key(uuid) to authenticated;
grant execute on function public.agent_clear_provider_key(uuid) to authenticated;
