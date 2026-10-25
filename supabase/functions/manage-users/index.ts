import { createClient } from 'jsr:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const service = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

const createSchema = z.object({
  email: z.string().email(),
  temp_password: z.string().min(10).max(72),
  display_name: z.string().min(1).max(60),
  role: z.enum(['su_admin', 'patabin_admin']).default('patabin_admin'),
  partner_name: z.string().min(1).max(60).optional(),
});

const resetSchema = z.object({ user_id: z.string().uuid(), temp_password: z.string().min(10).max(72) });
const activeSchema = z.object({ user_id: z.string().uuid(), is_active: z.boolean() });
const roleSchema = z.object({ user_id: z.string().uuid(), role: z.enum(['su_admin', 'patabin_admin']) });

type Profile = { id: string; role: 'su_admin' | 'patabin_admin'; is_active: boolean; display_name: string };

function json(body: unknown, status = 200, allowOrigin?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin, Vary: 'Origin' } : {}),
    },
  });
}

function cors(req: Request): { allowed: boolean; origin?: string } {
  const origin = req.headers.get('Origin');
  if (!origin) return { allowed: true };
  const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (configured.includes(origin)) return { allowed: true, origin };
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (isLocal && configured.length === 0) return { allowed: true, origin };
  return { allowed: false };
}

Deno.serve(async (req) => {
  const originCheck = cors(req);
  if (!originCheck.allowed) return json({ error: 'forbidden' }, 403);
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': originCheck.origin!,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, originCheck.origin);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'unauthorized' }, 401, originCheck.origin);

  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const callerId = userData?.user?.id;
  if (!callerId) return json({ error: 'unauthorized' }, 401, originCheck.origin);

  const { data: me } = await service.from<Profile>('profiles').select('id, role, is_active').eq('id', callerId).maybeSingle();
  if (!me?.is_active) return json({ error: 'unauthorized' }, 401, originCheck.origin);
  const callerRole: 'su_admin' | 'patabin_admin' = me.role;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400, originCheck.origin);
  }
  const action = (body as { action?: string })?.action;

  try {
    if (action === 'create_user') {
      const p = createSchema.parse(body);
      if (p.role === 'su_admin' && callerRole !== 'su_admin') return json({ error: 'forbidden' }, 403, originCheck.origin);
      const { data: created, error } = await service.auth.admin.createUser({
        email: p.email,
        password: p.temp_password,
        email_confirm: true,
      });
      if (error ?? !created?.user) return json({ error: 'email_taken' }, 409, originCheck.origin);
      const uid = created.user.id;
      await service.from('profiles').upsert({ id: uid, role: p.role, display_name: p.display_name, must_change_password: true, is_active: true });
      if (p.partner_name) {
        const { data: partner } = await service.from('partners').select('id').eq('name', p.partner_name).maybeSingle();
        if (partner) await service.from('partners').update({ user_id: uid }).eq('id', partner.id);
      }
      return json({ ok: true, user_id: uid }, 200, originCheck.origin);
    }

    if (action === 'reset_password') {
      const p = resetSchema.parse(body);
      const { data: target } = await service.from<Profile>('profiles').select('id, role, is_active').eq('id', p.user_id).maybeSingle();
      if (!target?.is_active) return json({ error: 'user_not_found' }, 404, originCheck.origin);
      if (target.role === 'su_admin' && callerRole !== 'su_admin') return json({ error: 'forbidden' }, 403, originCheck.origin);
      const { error: updErr } = await service.auth.admin.updateUserById(p.user_id, { password: p.temp_password });
      if (updErr) return json({ error: 'update_failed' }, 400, originCheck.origin);
      const { error: flagErr } = await service.from('profiles').update({ must_change_password: true }).eq('id', p.user_id);
      if (flagErr) return json({ error: 'update_failed' }, 400, originCheck.origin);
      const { data: check } = await service.from('profiles').select('must_change_password').eq('id', p.user_id).maybeSingle();
      if (!check?.must_change_password) return json({ error: 'update_failed' }, 500, originCheck.origin);
      return json({ ok: true }, 200, originCheck.origin);
    }

    if (action === 'set_active') {
      const p = activeSchema.parse(body);
      const { data: target } = await service.from<Profile>('profiles').select('id, role, is_active').eq('id', p.user_id).maybeSingle();
      if (!target) return json({ error: 'user_not_found' }, 404, originCheck.origin);
      if (target.role === 'su_admin' && callerRole !== 'su_admin') return json({ error: 'forbidden' }, 403, originCheck.origin);
      if (target.role === 'su_admin' && !p.is_active && target.is_active) {
        const { count: others } = await service.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'su_admin').eq('is_active', true).neq('id', target.id);
        if (!(others ?? 0)) return json({ error: 'conflict' }, 409, originCheck.origin);
      }
      const { error: flagErr } = await service.from('profiles').update({ is_active: p.is_active }).eq('id', p.user_id);
      if (flagErr) return json({ error: 'update_failed' }, 400, originCheck.origin);
      return json({ ok: true }, 200, originCheck.origin);
    }

    if (action === 'set_role') {
      const p = roleSchema.parse(body);
      if (callerRole !== 'su_admin') return json({ error: 'forbidden' }, 403, originCheck.origin);
      if (p.user_id === callerId) return json({ error: 'forbidden' }, 403, originCheck.origin);
      const { data: target } = await service.from<Profile>('profiles').select('id, role').eq('id', p.user_id).maybeSingle();
      if (!target) return json({ error: 'user_not_found' }, 404, originCheck.origin);
      if (target.role === 'su_admin' && p.role !== 'su_admin') {
        const { count } = await service.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'su_admin').eq('is_active', true);
        if ((count ?? 0) <= 1) return json({ error: 'conflict' }, 409, originCheck.origin);
      }
      const { error: roleErr } = await service.from('profiles').update({ role: p.role }).eq('id', p.user_id);
      if (roleErr) return json({ error: 'update_failed' }, 400, originCheck.origin);
      return json({ ok: true }, 200, originCheck.origin);
    }

    return json({ error: 'unknown_action' }, 400, originCheck.origin);
  } catch (err) {
    if (err instanceof z.ZodError) return json({ error: 'invalid_input' }, 400, originCheck.origin);
    return json({ error: 'internal' }, 500, originCheck.origin);
  }
});
