/* "Convert to…" — the continuous commercial flow.
 *
 * GET  returns the 9-stage chain for this record, which stages are already
 *      done, and the conversion steps available from this record (with a
 *      preview of the fields that will be copied).
 * POST creates the next record(s) from the declarative rules in conversions.ts.
 *
 * Both verbs honour the same module switches, role permissions, capabilities,
 * billing write gate, org row scope and soft-delete rules as ordinary records.
 */
import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { getResource, RESOURCE_MAP } from '@/lib/resources';
import { getRecord, createRecord, updateRecord, deleteRecord, logActivity } from '@/lib/records';
import { readGuard, writeGuard, capabilityGuard, billingGuard } from '@/lib/guard';
import { canWrite } from '@/lib/catalog';
import { buildScope } from '@/lib/access';
import { resourceFullyEnabled } from '@/lib/module-visibility';
import { fetchAll } from '@/lib/fetch';
import { CHAIN_STAGES, CHAIN_RESOURCE_IDS } from '@/lib/conversion-chain';
import {
  CONVERSION_RULES, buildContext, buildPreview, describePatch, provenance,
  type ConversionRule,
} from '@/lib/conversions';

type Ctx = { params: Promise<{ org: string; resource: string; id: string }> };
type ChainRow = {
  id: string; resource: string; number?: string; title?: string; status?: string;
  projectId?: string; sourceId?: string; sourceResource?: string; sourceNumber?: string;
  sourceLabel?: string;
};

const deny = (message: string, status = 403) => NextResponse.json({ error: message }, { status });

function hrefFor(org: string, r: { id: string; resource: string }) {
  return r.resource === 'projects'
    ? `/${org}/projects/${encodeURIComponent(r.id)}`
    : `/${org}/m/${r.resource}?open=${encodeURIComponent(r.id)}`;
}

function ruleAvailable(a: NonNullable<Awaited<ReturnType<typeof apiAuth>>>, rule: ConversionRule) {
  const targets = [rule.to, ...(rule.also || []).map(x => x.resource)];
  return targets.every(t => resourceFullyEnabled(a.config, t) && canWrite(a.role, t));
}

async function chainRows(orgId: string): Promise<ChainRow[]> {
  const recs = await fetchAll('records', q => q
    .eq('organization_id', orgId).is('deleted_at', null)
    .in('resource', CHAIN_RESOURCE_IDS),
  'id,resource,number,title,status,data,project_id');
  return (recs || []).map(r => {
    const d = (r.data && typeof r.data === 'object') ? r.data : {};
    return {
      id: r.id, resource: r.resource, number: r.number || d.number,
      title: r.title || d.name || d.title || d.subject, status: r.status || d.status,
      projectId: r.project_id || d.projectId,
      sourceId: d.sourceId, sourceResource: d.sourceResource,
      sourceNumber: d.sourceNumber, sourceLabel: d.sourceLabel,
    };
  });
}

/** Walk up the provenance links to the first record of this job, then walk
 *  down again so a quote, a certificate or a receipt all show the same chain. */
function buildChain(current: ChainRow, all: ChainRow[]) {
  const byId = new Map<string, ChainRow>(all.map(r => [r.id, r]));
  if (!byId.has(current.id)) byId.set(current.id, current);
  const children = new Map<string, ChainRow[]>();
  for (const r of all) {
    if (!r.sourceId) continue;
    const list = children.get(r.sourceId) || [];
    list.push(r);
    children.set(r.sourceId, list);
  }
  let root = byId.get(current.id)!;
  const seen = new Set<string>();
  while (root.sourceId && byId.has(root.sourceId) && !seen.has(root.id) && seen.size < 12) {
    seen.add(root.id);
    root = byId.get(root.sourceId)!;
  }
  const family = new Map<string, ChainRow>([[root.id, root]]);
  const queue = [root.id];
  let hops = 0;
  while (queue.length && hops++ < 100) {
    const parent = queue.shift()!;
    for (const child of children.get(parent) || []) {
      if (!family.has(child.id)) { family.set(child.id, child); queue.push(child.id); }
    }
  }
  if (!family.has(current.id)) family.set(current.id, current);
  const rows = Array.from(family.values());
  return CHAIN_STAGES.map(stage => {
    const match = rows.find(r => r.resource === stage.id && r.id === current.id)
      || rows.find(r => r.resource === stage.id);
    const state = match?.id === current.id ? 'current' : match ? 'done' : stage.optional ? 'skipped' : 'todo';
    return {
      id: stage.id, label: stage.label, short: stage.short, singular: stage.singular,
      icon: stage.icon, optional: !!stage.optional, state,
      record: match ? { id: match.id, number: match.number, title: match.title, status: match.status } : null,
    };
  });
}

export async function GET(_req: Request, { params }: Ctx) {
  const { org, resource, id } = await params;
  const a = await apiAuth(org);
  const def = getResource(resource);
  if (!a || !def) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = readGuard(a.config, a.role, resource);
  if (g) return g;
  const scope = await buildScope(a);
  const src = await getRecord(a.orgId, resource, id, scope);
  if (!src) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const all = await chainRows(a.orgId);
  const current: ChainRow = {
    id, resource, number: src.number, title: src.title || src.name || src.subject,
    status: src.status, projectId: src.projectId,
    sourceId: src.sourceId, sourceResource: src.sourceResource,
    sourceNumber: src.sourceNumber, sourceLabel: src.sourceLabel,
  };
  const children = all.filter(r => r.sourceId === id && r.sourceResource === resource);
  const ctx = buildContext(a.config.tax);
  const sourceRow = { ...src, id, resource, title: src.title || src.name || src.subject };

  const options = CONVERSION_RULES
    // Receipt creation and invoice settlement are not yet atomic. Do not
    // advertise this conversion until allocation and reconciliation exist.
    .filter(r => r.id !== 'invoice-to-receipt')
    .filter(r => r.from === resource && ruleAvailable(a, r))
    .map(r => {
      const existing = children.find(c => c.resource === r.to);
      return {
        id: r.id,
        to: r.to,
        label: r.label,
        hint: r.hint,
        icon: r.icon,
        creates: [RESOURCE_MAP[r.to]?.singular || r.to,
          ...(r.also || []).map(x => RESOURCE_MAP[x.resource]?.singular || x.resource)],
        preview: buildPreview(r.to, r.build(sourceRow, ctx)),
        also: (r.also || []).map(x => x.label),
        sourcePatch: r.sourcePatch ? describePatch(resource, r.sourcePatch(sourceRow)) : null,
        existing: existing ? {
          id: existing.id, number: existing.number, title: existing.title,
          href: hrefFor(org, existing),
        } : null,
      };
    });

  const chain = buildChain(current, all);
  // A client may be linked as a master record without being the provenance
  // parent. Resolve it with the same read and row-scope checks as other views.
  const clientStage = chain.find(stage => stage.id === 'clients');
  if (clientStage && !clientStage.record && src.clientId && !readGuard(a.config, a.role, 'clients')) {
    const linked = await getRecord(a.orgId, 'clients', String(src.clientId), scope);
    if (linked) {
      clientStage.state = 'done';
      clientStage.record = { id: linked.id, number: linked.number, title: linked.title || linked.name, status: linked.status };
    }
  }
  return NextResponse.json({
    chain,
    options,
    convertedFrom: current.sourceId ? {
      resource: current.sourceResource, id: current.sourceId,
      number: current.sourceNumber, label: current.sourceLabel,
      href: current.sourceResource ? hrefFor(org, { id: current.sourceId, resource: current.sourceResource }) : null,
    } : null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request, { params }: Ctx) {
  const { org, resource, id } = await params;
  const a = await apiAuth(org);
  const def = getResource(resource);
  if (!a || !def) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const rule = CONVERSION_RULES.find(r => r.id === String(body.to || '') && r.from === resource);
  if (!rule) return NextResponse.json({ error: 'Unknown conversion' }, { status: 400 });
  // Reject stale clients and direct requests as well as hiding the UI option.
  // A receipt must not be created until it can be allocated and settled atomically.
  if (rule.id === 'invoice-to-receipt') {
    return NextResponse.json({ error: 'Invoice receipt conversion is temporarily unavailable pending payment reconciliation.' }, { status: 409 });
  }

  const g = billingGuard(a, { write: true })
    || readGuard(a.config, a.role, resource)
    || capabilityGuard(a.role, 'records.create')
    || writeGuard(a.config, a.role, rule.to)
    || (rule.also || []).map(x => writeGuard(a.config, a.role, x.resource)).find(Boolean)
    || null;
  if (g) return g;
  if (!ruleAvailable(a, rule)) return deny('A required module is not enabled for your workspace');
  if (rule.sourcePatch && writeGuard(a.config, a.role, resource)) return deny('Your role cannot update the source record');

  const scope = await buildScope(a);
  const src = await getRecord(a.orgId, resource, id, scope);
  if (!src) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Idempotency: one copy per source record per rule. Recheck inside POST so a
  // double click or a stale drawer cannot create duplicates.
  const existing = await fetchAll('records', q => q
    .eq('organization_id', a.orgId).eq('resource', rule.to).is('deleted_at', null),
  'id,resource,number,title,data');
  const duplicate = (existing || []).find(r => r.data?.sourceId === id && r.data?.sourceResource === resource);
  if (duplicate) return NextResponse.json({
    error: 'Already converted',
    existing: { id: duplicate.id, number: duplicate.number, title: duplicate.title, href: hrefFor(org, { id: duplicate.id, resource: rule.to }) },
  }, { status: 409 });

  const ctx = buildContext(a.config.tax);
  const sourceRow = { ...src, id, resource, title: src.title || src.name || src.subject };
  const targetDef = getResource(rule.to)!;
  const payload = { ...rule.build(sourceRow, ctx), ...provenance(resource, sourceRow) };
  const created = await createRecord(a.orgId, a.userId, a.name, targetDef, payload, a.config.limits, a.config.tax);
  if (!created.ok) return NextResponse.json({ error: 'Could not create the next record', errors: created.errors }, { status: created.status || 400 });

  const rows: any[] = [created.row];
  for (const step of rule.also || []) {
    const stepDef = getResource(step.resource)!;
    const stepPayload = {
      ...step.build(sourceRow, created.row, ctx),
      ...provenance(rule.to, { ...created.row, title: created.row.title || created.row.name }),
    };
    const made = await createRecord(a.orgId, a.userId, a.name, stepDef, stepPayload, a.config.limits, a.config.tax);
    if (!made.ok) {
      // Keep the flow atomic from the user's point of view: undo the primary.
      await deleteRecord(a.orgId, a.userId, a.name, targetDef, created.row.id);
      return NextResponse.json({ error: `Could not create the ${step.label}`, errors: made.errors }, { status: 400 });
    }
    rows.push(made.row);
  }

  let sourceUpdated = false;
  if (rule.sourcePatch) {
    const patched = await updateRecord(a.orgId, a.userId, a.name, def, id, rule.sourcePatch(sourceRow));
    sourceUpdated = patched.ok;
  }
  await logActivity(a.orgId, a.userId, a.name, 'CONVERT', rule.to,
    `Converted ${sourceRow.number || resource} → ${rows.map(r => r.number).join(' + ')}`);

  return NextResponse.json({
    ok: true,
    rows,
    primary: created.row,
    href: hrefFor(org, { id: created.row.id, resource: rule.to }),
    sourceUpdated,
  }, { status: 201 });
}
