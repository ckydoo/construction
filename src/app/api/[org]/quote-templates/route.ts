/* Workspace-scoped Quote Studio templates. The module, role, capability and
 * billing gates are checked here, and the new table's RLS policies enforce the
 * same rules again at the database boundary. */
import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  readGuard, writeGuard, deleteGuard, capabilityGuard, billingGuard,
} from '@/lib/guard';
import {
  BUILT_IN_QUOTE_TEMPLATES, sanitiseTemplatePayload,
  type QuoteTemplate,
} from '@/lib/quote-studio';

type Ctx = { params: Promise<{ org: string }> };
const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const cleanName = (v: unknown) => String(v ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 80);
const cleanDescription = (v: unknown) => String(v ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 240);

function templateView(row: any): QuoteTemplate {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    description: String(row.description || ''),
    payload: sanitiseTemplatePayload(row.payload),
    createdByName: String(row.created_by_name || ''),
    updatedAt: row.updated_at || undefined,
  };
}

export async function GET(_req: Request, { params }: Ctx) {
  const { org } = await params;
  const a = await apiAuth(org); if (!a) return err('Unauthorized', 401);
  const g = readGuard(a.config, a.role, 'estimates'); if (g) return g;
  const sb = await supabase();
  const { data, error } = await sb.from('quote_templates')
    .select('id,name,description,payload,created_by_name,updated_at')
    .eq('organization_id', a.orgId)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) return err(error.message, 403);
  const starters = BUILT_IN_QUOTE_TEMPLATES.map(t => ({
    ...t, payload: sanitiseTemplatePayload(t.payload),
  }));
  return NextResponse.json({
    templates: (data || []).map(templateView),
    starters,
    canWrite: !writeGuard(a.config, a.role, 'estimates') && !capabilityGuard(a.role, 'records.create'),
  });
}

export async function POST(req: Request, { params }: Ctx) {
  const { org } = await params;
  const a = await apiAuth(org); if (!a) return err('Unauthorized', 401);
  let b: any;
  try { b = await req.json(); } catch { return err('Expected JSON body'); }
  const action = String(b.action || 'create');
  const id = String(b.id || '');
  const name = cleanName(b.name);
  const description = cleanDescription(b.description);
  const payload = sanitiseTemplatePayload(b.payload);

  const bg = billingGuard(a, { write: true }); if (bg) return bg;
  if (action === 'delete') {
    const g = deleteGuard(a.config, a.role, 'estimates') || capabilityGuard(a.role, 'records.delete'); if (g) return g;
    if (!id) return err('Template id is required');
    const sb = await supabase();
    const { data, error } = await sb.from('quote_templates').delete()
      .eq('id', id).eq('organization_id', a.orgId).select('id').maybeSingle();
    if (error) return err(error.message, 403);
    if (!data) return err('Template not found', 404);
    return NextResponse.json({ ok: true });
  }

  const g = writeGuard(a.config, a.role, 'estimates')
    || capabilityGuard(a.role, action === 'update' ? 'records.update' : 'records.create');
  if (g) return g;
  if (name.length < 2) return err('Give the template a name');
  const sb = await supabase();

  if (action === 'update') {
    if (!id) return err('Template id is required');
    const { data, error } = await sb.from('quote_templates').update({
      name, description, payload, updated_by_id: a.userId, updated_at: new Date().toISOString(),
    }).eq('id', id).eq('organization_id', a.orgId)
      .select('id,name,description,payload,created_by_name,updated_at').maybeSingle();
    if (error) return err(error.message, 403);
    if (!data) return err('Template not found', 404);
    return NextResponse.json({ template: templateView(data) });
  }

  if (action !== 'create') return err('Unknown action');
  const { data, error } = await sb.from('quote_templates').insert({
    organization_id: a.orgId, name, description, payload,
    created_by_id: a.userId, created_by_name: a.name,
    updated_by_id: a.userId,
  }).select('id,name,description,payload,created_by_name,updated_at').single();
  if (error) return err(error.message, 403);
  return NextResponse.json({ template: templateView(data) }, { status: 201 });
}
