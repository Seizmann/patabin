import { supabase } from 'lib/supabase';

export type Conversation = { id: string; title: string; last_activity_at: string };

export type ChatMessageRow = {
  id: string;
  seq: number;
  role: string;
  content: string | null;
  tool_name: string | null;
  tool_call_id: string | null;
  model_id: string | null;
  event: { type?: string; questions?: unknown[] } | null;
};

export type PendingAction = {
  id: string;
  conversation_id: string | null;
  tool: string;
  payload: Record<string, unknown>;
  defaults_used: string[] | null;
  preview: Record<string, unknown> | null;
  preview_hash: string;
  status: string;
  model_id: string;
  expires_at: string;
  result_table: string | null;
  result_id: string | null;
  error: string | null;
};

export async function listPendingActions(): Promise<PendingAction[]> {
  const { data, error } = await supabase
    .from('agent_pending_actions')
    .select('id, conversation_id, tool, payload, defaults_used, preview, preview_hash, status, model_id, expires_at, result_table, result_id, error')
    .in('status', ['pending', 'executed', 'rejected', 'expired', 'failed', 'stale'])
    .gte('expires_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as PendingAction[];
}

export async function approveAction(id: string, previewHash: string): Promise<Record<string, unknown>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('NO_SESSION');
  const base = (import.meta.env.VITE_AGENT_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
  const res = await fetch(`${base}/v1/actions/${id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ preview_hash: previewHash }),
  });
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error('AGENT_UNREACHABLE');
  return (await res.json()) as Record<string, unknown>;
}

export async function rejectAction(id: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('NO_SESSION');
  const base = (import.meta.env.VITE_AGENT_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
  const res = await fetch(`${base}/v1/actions/${id}/reject`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error('AGENT_UNREACHABLE');
}

export async function approveAllActions(items: { id: string; preview_hash: string }[]): Promise<Record<string, unknown>[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('NO_SESSION');
  const base = (import.meta.env.VITE_AGENT_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
  const res = await fetch(`${base}/v1/actions/approve-all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ actions: items }),
  });
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error('AGENT_UNREACHABLE');
  const out = (await res.json()) as { results?: Record<string, unknown>[] };
  return out.results ?? [];
}

export type Question = { id: string; text: string; kind: string; options?: { label: string; value: string }[] };

export type ProposalEventPayload = { action_id?: string; tool?: string };

export type ChatModel = { model_id: string; display_name: string; is_default: boolean };

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('agent_conversations')
    .select('id, title, last_activity_at')
    .order('last_activity_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as Conversation[];
}

export async function createConversation(title: string): Promise<string> {
  const { data, error } = await supabase.from('agent_conversations').insert({ title }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const { error } = await supabase.from('agent_conversations').update({ title }).eq('id', id);
  if (error) throw error;
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from('agent_conversations').delete().eq('id', id);
  if (error) throw error;
}

export async function listMessages(conversationId: string): Promise<ChatMessageRow[]> {
  const { data, error } = await supabase
    .from('agent_messages')
    .select('id, seq, role, content, tool_name, tool_call_id, model_id, event')
    .eq('conversation_id', conversationId)
    .order('seq');
  if (error) throw error;
  return (data ?? []) as ChatMessageRow[];
}

export async function listChatModels(): Promise<ChatModel[]> {
  const { data, error } = await supabase
    .from('agent_models')
    .select('model_id, display_name, is_default')
    .eq('is_active', true)
    .not('fallback_position', 'is', null)
    .order('fallback_position');
  if (error) throw error;
  return (data ?? []) as ChatModel[];
}

export type StreamEvent = { name: string; payload: Record<string, unknown> };

export async function streamChat(
  input: { conversationId: string | null; message: string; modelId: string | null; answerTo: string | null },
  onEvent: (e: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('NO_SESSION');
  const base = (import.meta.env.VITE_AGENT_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
  const res = await fetch(`${base}/v1/chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation_id: input.conversationId,
      message: input.message,
      model_id: input.modelId,
      answer_to: input.answerTo,
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    if (res.status === 429) throw new Error('RATE_LIMITED');
    throw new Error('AGENT_UNREACHABLE');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let name = 'message';
      const dataLines: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) name = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      try {
        const payload = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
        onEvent({ name, payload });
      } catch {
        onEvent({ name, payload: {} });
      }
    }
  }
}
