/* Shared Supabase demo-data payload.
 * Used by scripts/seed-supabase.ts (Node CLI) and by Settings → Load demo data
 * in the Next.js app. Keeps records, wallets, derived figures and sample PDFs
 * identical no matter which entry point seeds the workspace.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { buildDemo } from './demo';
import { BRAND } from './brand';

export const DEFAULT_BUCKET = 'buildops-documents';
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const uuid = () =>
  (globalThis as any).crypto?.randomUUID?.() ||
  Math.random().toString(36).slice(2) + Date.now().toString(36);

function toDb(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toDb);
  if (value && typeof value === 'object' && !(value instanceof Uint8Array)) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      if (k === 'data' || k === 'config') {
        out[snake(k)] = typeof v === 'string' ? JSON.parse(v || '{}') : v;
      } else {
        out[snake(k)] = toDb(v);
      }
    }
    return out;
  }
  return value;
}

async function insertChunked(client: any, table: string, rows: any[]) {
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await client.from(table).insert(rows.slice(i, i + 100));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function rpc(client: any, fn: string, args: Record<string, any>) {
  const { error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
}

export async function clearBusinessData(client: SupabaseClient, orgId: string, bucket = DEFAULT_BUCKET) {
  for (const table of [
    'wallet_transactions', 'wallets', 'attachments', 'comments',
    'audit_logs', 'notifications', 'sequences', 'records',
  ]) {
    const { error } = await client.from(table).delete().eq('organization_id', orgId);
    if (error) throw new Error(`clear ${table}: ${error.message}`);
  }
  // Remove the binaries too; objects are stored at <org>/<record>/<file>.
  try {
    const folders = await client.storage.from(bucket).list(orgId, { limit: 1000 });
    for (const folder of folders.data || []) {
      const files = await client.storage.from(bucket).list(`${orgId}/${folder.name}`, { limit: 1000 });
      const paths = (files.data || []).map(f => `${orgId}/${folder.name}/${f.name}`);
      if (paths.length) await client.storage.from(bucket).remove(paths);
    }
  } catch { /* bucket may not exist yet — seed will create it via migrations */ }
}

const BASE = new Date('2026-11-07T09:00:00Z');
const at = (days: number) => new Date(BASE.getTime() + days * 86400000);
const clientId = (orgId: string, key: string) => `${orgId}_${key}`;
const projectId = (orgId: string, key: string) => `${orgId}_${key}`;

type Step = {
  kind: 'TOPUP' | 'ALLOCATION' | 'REVERSAL';
  amount: number;
  days: number;
  projectKey?: string;
  reference?: string;
  method?: string;
  note?: string;
  actor?: string;
};

const WALLET_SEEDS: { clientKey: string; steps: Step[] }[] = [
  { clientKey: 'cli-1', steps: [
    { kind: 'TOPUP', amount: 300000000, days: -60, reference: 'RTGS-2026-0912', method: 'Bank transfer (USD)', note: 'Advance payment deposit – Phase 2', actor: 'Farai Nyamayaro' },
    { kind: 'ALLOCATION', amount: -125000000, days: -45, projectKey: 'prj-1', note: 'Mobilisation advance – Borrowdale Phase 2', actor: 'Tendai Muchengeti' },
    { kind: 'TOPUP', amount: 200000000, days: -20, reference: 'RTGS-2026-1044', method: 'Bank transfer (USD)', note: 'Second tranche received', actor: 'Farai Nyamayaro' },
    { kind: 'ALLOCATION', amount: -80000000, days: -8, projectKey: 'prj-1', note: 'Structural steel package funding', actor: 'Lisa Goromonzi' },
  ]},
  { clientKey: 'cli-2', steps: [
    { kind: 'TOPUP', amount: 420000000, days: -70, reference: 'RTGS-2026-0831', method: 'Bank transfer (USD)', note: 'Plant expansion advance', actor: 'Farai Nyamayaro' },
    { kind: 'ALLOCATION', amount: -140000000, days: -40, projectKey: 'prj-2', note: 'Civil works tranche 1', actor: 'Tendai Muchengeti' },
    { kind: 'ALLOCATION', amount: -20000000, days: -15, projectKey: 'prj-2', note: 'Duplicate allocation (reversed)', actor: 'Rutendo Chikomba' },
    { kind: 'REVERSAL', amount: 20000000, days: -10, projectKey: 'prj-2', note: 'Reversed duplicate allocation', actor: 'Farai Nyamayaro' },
  ]},
  { clientKey: 'cli-3', steps: [
    { kind: 'TOPUP', amount: 300000000, days: -65, reference: 'TREAS-2026-0441', method: 'Treasury warrant', note: 'Road rehabilitation vote 3', actor: 'Farai Nyamayaro' },
    { kind: 'ALLOCATION', amount: -110000000, days: -30, projectKey: 'prj-3', note: 'Lot 3 earthworks funding', actor: 'Tendai Muchengeti' },
  ]},
  { clientKey: 'cli-4', steps: [
    { kind: 'TOPUP', amount: 75000000, days: -18, reference: 'RTGS-2026-1077', method: 'Bank transfer (USD)', note: 'Retention release held on account', actor: 'Farai Nyamayaro' },
  ]},
  { clientKey: 'cli-6', steps: [
    { kind: 'TOPUP', amount: 150000000, days: -25, reference: 'RTGS-2026-1019', method: 'Bank transfer (USD)', note: 'Capex reserve – unallocated', actor: 'Farai Nyamayaro' },
  ]},
  { clientKey: 'cli-9', steps: [
    { kind: 'TOPUP', amount: 200000000, days: -12, reference: 'RTGS-2026-1102', method: 'Bank transfer (USD)', note: 'Graniteside pre-construction deposit', actor: 'Farai Nyamayaro' },
    { kind: 'ALLOCATION', amount: -90000000, days: -5, projectKey: 'prj-5', note: 'Design & pre-construction funding', actor: 'Lisa Goromonzi' },
  ]},
];

const revisionLabel = (n: number) => `Rev ${n <= 26 ? String.fromCharCode(64 + n) : 'R' + n}`;

/** pdf-lib's built-in fonts use WinAnsi; keep seeded demo titles encodable. */
function winAnsi(s: string): string {
  return String(s || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2026]/g, '...')
    .replace(/[^\x20-\x7E]/g, ' ');
}

async function pdfBytes(kind: string, title: string, orgName: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);
  const ink = rgb(0.08, 0.12, 0.18);
  const amber = rgb(0.92, 0.55, 0.12);
  const muted = rgb(0.4, 0.45, 0.52);
  const safeOrg = winAnsi(orgName).slice(0, 52);
  const safeTitle = winAnsi(title).slice(0, 62);
  page.drawRectangle({ x: 0, y: 802, width: 595, height: 40, color: ink });
  page.drawText(BRAND.name, { x: 40, y: 816, size: 16, font: bold, color: rgb(1, 1, 1) });
  page.drawText(BRAND.descriptor, { x: 98, y: 817, size: 6.5, font: bold, color: amber });
  page.drawText(safeOrg, { x: 40, y: 805, size: 8, font, color: rgb(0.8, 0.84, 0.9) });
  page.drawText(kind.toUpperCase(), { x: 455, y: 818, size: 8, font: bold, color: amber });
  page.drawText(safeTitle, { x: 40, y: 760, size: 18, font: bold, color: ink });
  page.drawText(`Generated from the ${BRAND.name} Supabase demo workspace.`, { x: 40, y: 730, size: 10, font, color: muted });
  page.drawText(BRAND.motto, { x: 40, y: 715, size: 9, font: bold, color: amber });
  page.drawText(`Document: ${safeTitle}`, { x: 40, y: 700, size: 11, font, color: ink });
  page.drawText('Sample attachment — replace with a real drawing or certificate.', { x: 40, y: 675, size: 10, font, color: muted });
  page.drawLine({ start: { x: 40, y: 650 }, end: { x: 555, y: 650 }, thickness: 1, color: amber });
  page.drawText(`Issued: ${new Date(BASE).toLocaleDateString('en-GB')}`, { x: 40, y: 625, size: 10, font, color: ink });
  page.drawText('Kestrel Ridge Construction & Industrial Group (Pvt) Ltd', { x: 40, y: 60, size: 8, font, color: muted });
  return pdf.save();
}

async function uploadSamplePdfs(
  client: SupabaseClient,
  orgId: string,
  userId: string,
  actorName: string,
  orgName: string,
  records: { id: string; resource: string; title: string }[],
  bucket: string,
) {
  const project = records.find((r) => r.resource === 'projects');
  const contract = records.find((r) => r.resource === 'contracts');
  const invoice = records.find((r) => r.resource === 'arInvoices');
  if (!project || !contract || !invoice) throw new Error('Demo records are missing PDF targets');

  const specs = [
    { rec: project, kind: 'Drawing', file: 'Borrowdale-Phase-2-structural-drawing.pdf', doc: 'doc-1', rev: 1, latest: false },
    { rec: project, kind: 'Drawing', file: 'Borrowdale-Phase-2-structural-drawing-Rev-B.pdf', doc: 'doc-1', rev: 2, latest: true },
    { rec: contract, kind: 'Contract', file: 'NEC4-ECC-Option-A-executed.pdf', doc: 'doc-2', rev: 1, latest: true },
    { rec: invoice, kind: 'Tax invoice', file: 'TI-2026-4412.pdf', doc: 'doc-3', rev: 1, latest: true },
  ];
  const rows: any[] = [];
  for (const s of specs) {
    const bytes = await pdfBytes(s.kind, s.rec.title, orgName);
    const stored = `${uuid()}-${s.file.replace(/[^a-zA-Z0-9._()-]/g, '_')}`;
    const path = `${orgId}/${s.rec.id}/${stored}`;
    const { error } = await client.storage.from(bucket).upload(path, bytes, {
      contentType: 'application/pdf', upsert: true,
    });
    if (error) throw new Error(`upload ${s.file}: ${error.message}`);
    rows.push({
      id: uuid(), organization_id: orgId, record_id: s.rec.id, resource: s.rec.resource,
      file_name: s.file, stored_name: path, mime: 'application/pdf', size: bytes.length,
      uploaded_by_id: userId, uploaded_by_name: actorName,
      document_key: s.doc, revision: s.rev, revision_label: revisionLabel(s.rev),
      is_latest: s.latest, note: s.rev > 1 ? 'Revised issue' : 'Original issue',
      created_at: new Date(BASE.getTime() - 2 * 86400000).toISOString(),
    });
  }
  await insertChunked(client, 'attachments', rows);
  return rows.length;
}

export async function seedBusinessData(
  client: SupabaseClient,
  orgId: string,
  userId: string,
  actorName: string,
  bucket = DEFAULT_BUCKET,
) {
  const demo = buildDemo(orgId);
  await clearBusinessData(client, orgId, bucket);

  const records = demo.records.map((r) => toDb({
    ...r, organizationId: orgId, createdById: userId, deletedAt: null,
  }));
  await insertChunked(client, 'records', records);

  const byRes: Record<string, number> = {};
  for (const r of demo.records) byRes[r.resource] = (byRes[r.resource] || 0) + 1;
  await insertChunked(client, 'sequences', Object.entries(byRes).map(([resource, n]) => ({
    organization_id: orgId, resource, next: n + 1,
  })));
  await insertChunked(client, 'notifications', demo.notifications.map((n) => toDb({
    ...n, organizationId: orgId, userId: null,
  })));
  await insertChunked(client, 'audit_logs', demo.auditLogs.map((a) => toDb({
    ...a, organizationId: orgId, userId,
  })));
  await insertChunked(client, 'comments', demo.comments.map((c) => toDb({
    ...c, organizationId: orgId, authorId: userId,
  })));

  const projectIds = new Set<string>();
  for (const seed of WALLET_SEEDS) {
    const cid = clientId(orgId, seed.clientKey);
    const { data: exists } = await client.from('records').select('id')
      .eq('organization_id', orgId).eq('id', cid).eq('resource', 'clients')
      .is('deleted_at', null).maybeSingle();
    if (!exists) continue;

    const { data: wallet, error: wErr } = await client.from('wallets').insert({
      organization_id: orgId, client_id: cid, currency: 'USD', balance_cents: 0,
    }).select('id').single();
    if (wErr) throw new Error(`wallet: ${wErr.message}`);

    let balance = 0;
    let pendingReversalOf: string | null = null;
    for (const step of seed.steps) {
      balance += step.amount;
      const pid = step.projectKey ? projectId(orgId, step.projectKey) : null;
      if (pid) projectIds.add(pid);
      const txId = uuid();
      const { error } = await client.from('wallet_transactions').insert({
        id: txId, organization_id: orgId, wallet_id: wallet.id, client_id: cid,
        project_id: pid, kind: step.kind, amount_cents: step.amount,
        balance_cents: balance, currency: 'USD',
        reference: step.reference || null, method: step.method || null,
        note: step.note || null, actor_id: userId, actor_name: step.actor || actorName,
        reverses_id: step.kind === 'REVERSAL' ? pendingReversalOf : null,
        reversed_at: null, idempotency_key: null, created_at: at(step.days).toISOString(),
      });
      if (error) throw new Error(`wallet transaction: ${error.message}`);
      if (step.note?.includes('Duplicate allocation')) pendingReversalOf = txId;
      if (step.kind === 'REVERSAL' && pendingReversalOf) {
        const { error: revErr } = await client.from('wallet_transactions')
          .update({ reversed_at: at(step.days).toISOString() }).eq('id', pendingReversalOf);
        if (revErr) throw new Error(`reversal: ${revErr.message}`);
        pendingReversalOf = null;
      }
    }
    const { error: balErr } = await client.from('wallets')
      .update({ balance_cents: balance }).eq('id', wallet.id);
    if (balErr) throw new Error(`wallet balance: ${balErr.message}`);
    await rpc(client, 'app_mirror_client_balance', {
      p_org: orgId, p_client_id: cid, p_balance_cents: balance,
    });
  }
  for (const pid of projectIds) {
    await rpc(client, 'app_mirror_project', { p_org: orgId, p_project_id: pid });
  }

  const { data: orgRow } = await client.from('organizations').select('name').eq('id', orgId).single();
  const pdfs = await uploadSamplePdfs(
    client, orgId, userId, actorName, orgRow?.name || BRAND.name,
    demo.records.map((r) => ({ id: r.id, resource: r.resource, title: r.title })),
    bucket,
  );
  return { records: demo.records.length, wallets: WALLET_SEEDS.length, pdfs };
}
