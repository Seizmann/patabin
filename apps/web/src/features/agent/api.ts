import { supabase } from 'lib/supabase';

export type AgentProvider = {
  id: string;
  name: string;
  base_url: string;
  vault_secret_id: string | null;
  key_last4: string | null;
  extra_headers: Record<string, string>;
  is_active: boolean;
};

export type AgentModel = {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  supports_tools: boolean;
  supports_streaming: boolean;
  is_active: boolean;
  fallback_position: number | null;
  is_default: boolean;
};

export type ProviderTestResult = { ok: boolean; model?: string; latency_ms?: number; error?: string };

export async function listProviders(): Promise<AgentProvider[]> {
  const { data, error } = await supabase.from('agent_providers').select('*').order('created_at');
  if (error) throw error;
  return (data ?? []) as AgentProvider[];
}

export async function addProvider(name: string, baseUrl: string): Promise<void> {
  const { error } = await supabase.from('agent_providers').insert({ name, base_url: baseUrl.replace(/\/+$/, '') });
  if (error) throw error;
}

export async function updateProvider(id: string, patch: Partial<Pick<AgentProvider, 'name' | 'base_url' | 'is_active'>>): Promise<void> {
  const { error } = await supabase.from('agent_providers').update(patch).eq('id', id);
  if (error) throw error;
}

export async function setProviderKey(id: string, key: string): Promise<void> {
  const { error } = await supabase.rpc('agent_set_provider_key', { p_provider_id: id, p_key: key });
  if (error) throw error;
}

export async function clearProviderKey(id: string): Promise<void> {
  const { error } = await supabase.rpc('agent_clear_provider_key', { p_provider_id: id });
  if (error) throw error;
}

export async function listModels(providerId: string): Promise<AgentModel[]> {
  const { data, error } = await supabase
    .from('agent_models')
    .select('*')
    .eq('provider_id', providerId)
    .order('fallback_position', { ascending: true, nullsFirst: false })
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as AgentModel[];
}

export async function addModel(input: { provider_id: string; model_id: string; display_name: string; supports_tools: boolean }): Promise<void> {
  const { error } = await supabase.from('agent_models').insert(input);
  if (error) throw error;
}

export async function updateModel(id: string, patch: Partial<Pick<AgentModel, 'is_active' | 'fallback_position' | 'is_default'>>): Promise<void> {
  const { error } = await supabase.from('agent_models').update(patch).eq('id', id);
  if (error) throw error;
}

export async function setDefaultModel(id: string): Promise<void> {
  const { error: clearErr } = await supabase.from('agent_models').update({ is_default: false }).eq('is_default', true);
  if (clearErr) throw clearErr;
  const { error } = await supabase.from('agent_models').update({ is_default: true }).eq('id', id);
  if (error) throw error;
}

export async function reorderFallback(orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('agent_models').update({ fallback_position: i + 1 }).eq('id', orderedIds[i]);
    if (error) throw error;
  }
}

export async function removeFromChain(id: string): Promise<void> {
  const { error } = await supabase.from('agent_models').update({ fallback_position: null }).eq('id', id);
  if (error) throw error;
}

export async function testProvider(providerId: string): Promise<ProviderTestResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'NO_SESSION' };
  const base = import.meta.env.VITE_AGENT_URL;
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/+$/, '')}/v1/providers/${providerId}/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    return { ok: false, error: 'AGENT_UNREACHABLE' };
  }
  if (res.status === 429) return { ok: false, error: 'RATE_LIMITED' };
  return (await res.json().catch(() => ({ ok: false, error: 'AGENT_UNREACHABLE' }))) as ProviderTestResult;
}
