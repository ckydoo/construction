/* Client wallet service.
   A wallet is a prepaid account owned by exactly one client record. The
   WalletTransaction ledger is immutable: money only moves through TOPUP,
   ALLOCATION and REVERSAL entries. Balance = sum(ledger), and derived figures
   are mirrored into the client and project records so every module sees them. */
import prisma from './db';
import type { AuthCtx } from './auth';
import type { Scope } from './access';
import { rowAllowed } from './access';

export class WalletError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

const MAX_CENTS = 100_000_000_000; // 1 billion units
function toCents(value: unknown): number {
  const n = Number(value);
  if (!isFinite(n) || n <= 0) throw new WalletError('Enter an amount greater than zero');
  const cents = Math.round(n * 100);
  if (cents <= 0 || cents > MAX_CENTS) throw new WalletError('Amount is outside the allowed range');
  return cents;
}
const units = (cents: number) => Math.round(cents) / 100;
const str = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max) || null;

function parseData(raw: string): Record<string, any> {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

async function clientRow(tx: any, orgId: string, clientId: string) {
  const rec = await tx.record.findFirst({ where: { id: clientId, organizationId: orgId, resource: 'clients', deletedAt: null } });
  if (!rec) throw new WalletError('Client not found', 404);
  return rec;
}

async function getOrCreateWallet(tx: any, orgId: string, clientId: string, currency: string) {
  let w = await tx.wallet.findUnique({ where: { organizationId_clientId: { organizationId: orgId, clientId } } });
  if (!w) w = await tx.wallet.create({ data: { organizationId: orgId, clientId, currency, balanceCents: 0 } });
  return w;
}

async function mirrorDerived(tx: any, orgId: string, clientId: string, balanceCents: number, projectId?: string | null) {
  // Client register: live "amount left on the wallet" column.
  const client = await tx.record.findFirst({ where: { id: clientId, organizationId: orgId, resource: 'clients', deletedAt: null }, select: { id: true, data: true } });
  if (client) {
    const d = parseData(client.data);
    d.walletBalance = units(balanceCents);
    await tx.record.update({ where: { id: client.id }, data: { data: JSON.stringify(d) } });
  }
  if (!projectId) return;
  const project = await tx.record.findFirst({ where: { id: projectId, organizationId: orgId, resource: 'projects', deletedAt: null }, select: { id: true, data: true } });
  if (!project) return;
  const agg = await tx.walletTransaction.aggregate({
    where: { organizationId: orgId, projectId, kind: 'ALLOCATION', reversedAt: null },
    _sum: { amountCents: true },
  });
  const funded = units(-(agg._sum.amountCents || 0));
  const d = parseData(project.data);
  const target = Number(d.contractValue ?? d.budget ?? 0) || 0;
  d.fundedAmount = funded;
  d.remainingToFund = Math.max(0, target - funded);
  await tx.record.update({ where: { id: project.id }, data: { data: JSON.stringify(d) } });
}

function txView(t: any) {
  return {
    id: t.id, kind: t.kind, amount: units(t.amountCents), balanceAfter: units(t.balanceCents),
    currency: t.currency, projectId: t.projectId, reference: t.reference, method: t.method,
    note: t.note, actorName: t.actorName, reversesId: t.reversesId,
    reversedAt: t.reversedAt ? t.reversedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  };
}

/** All wallets in the workspace, one card per client (including zero balances). */
export async function listWallets(a: AuthCtx, scope: Scope) {
  const clients = await prisma.record.findMany({
    where: { organizationId: a.orgId, resource: 'clients', deletedAt: null },
    select: { id: true, number: true, title: true, status: true, data: true },
    orderBy: { createdAt: 'asc' },
  });
  const visible = clients.filter(c => rowAllowed(scope, 'clients', { id: c.id, ...parseData(c.data) }));
  const wallets = await prisma.wallet.findMany({ where: { organizationId: a.orgId } });
  const txs = await prisma.walletTransaction.findMany({ where: { organizationId: a.orgId }, select: { walletId: true, clientId: true, kind: true, amountCents: true, projectId: true, reversedAt: true, createdAt: true } });
  const byWallet = new Map<string, typeof txs>();
  for (const t of txs) { const arr = byWallet.get(t.walletId) || []; arr.push(t); byWallet.set(t.walletId, arr); }
  const currency = a.org.baseCurrency || 'USD';
  const rows = visible.map(c => {
    const d = parseData(c.data);
    const w = wallets.find(x => x.clientId === c.id);
    const list = w ? (byWallet.get(w.id) || []) : [];
    const sumKind = (kind: string) => list.filter(t => t.kind === kind).reduce((n, t) => n + t.amountCents, 0);
    const toppedUp = units(sumKind('TOPUP'));
    const grossAllocated = units(-sumKind('ALLOCATION'));
    const reversed = units(sumKind('REVERSAL'));
    const balance = units(w?.balanceCents || 0);
    const activeProjects = new Set(list.filter(t => t.kind === 'ALLOCATION' && !t.reversedAt && t.projectId).map(t => t.projectId!)).size;
    return {
      clientId: c.id, clientName: c.title || d.name || c.number, clientNumber: c.number,
      clientStatus: c.status, walletId: w?.id || null, currency: w?.currency || currency,
      balance, toppedUp, allocated: grossAllocated, reversed,
      netAllocated: Math.max(0, grossAllocated - Math.max(0, reversed)),
      projectCount: activeProjects,
      lastActivity: list.length ? new Date(Math.max(...list.map(t => t.createdAt.getTime()))).toISOString() : null,
      txCount: list.length,
    };
  }).sort((x, y) => y.balance - x.balance || x.clientName.localeCompare(y.clientName));
  return {
    wallets: rows, currency,
    summary: {
      clientCount: rows.length,
      fundedWallets: rows.filter(r => r.walletId && r.txCount > 0).length,
      totalBalance: rows.reduce((n, r) => n + r.balance, 0),
      totalToppedUp: rows.reduce((n, r) => n + r.toppedUp, 0),
      totalAllocated: rows.reduce((n, r) => n + r.netAllocated, 0),
      fundedProjects: rows.reduce((n, r) => n + r.projectCount, 0),
    },
  };
}

export async function walletDetail(a: AuthCtx, clientId: string, scope: Scope) {
  const client = await prisma.record.findFirst({ where: { id: clientId, organizationId: a.orgId, resource: 'clients', deletedAt: null } });
  if (!client) throw new WalletError('Client not found', 404);
  if (!rowAllowed(scope, 'clients', { id: clientId, ...parseData(client.data) })) throw new WalletError('You can only view your own wallet', 403);
  const w = await prisma.wallet.findUnique({ where: { organizationId_clientId: { organizationId: a.orgId, clientId } } });
  const txs = w ? await prisma.walletTransaction.findMany({ where: { walletId: w.id, organizationId: a.orgId }, orderBy: { createdAt: 'desc' }, take: 200 }) : [];
  const projectsRaw = await prisma.record.findMany({ where: { organizationId: a.orgId, resource: 'projects', deletedAt: null }, orderBy: { createdAt: 'asc' }, take: 500 });
  const projects = projectsRaw.filter(p => parseData(p.data).clientId === clientId).map(p => {
    const d = parseData(p.data);
    return { id: p.id, name: d.name || p.title || p.number, code: d.code || p.number,
      contractValue: Number(d.contractValue || 0), fundedAmount: Number(d.fundedAmount || 0),
      remainingToFund: Number(d.remainingToFund ?? Number(d.contractValue || 0)), status: p.status };
  });
  const allocations = txs.filter(t => t.kind === 'ALLOCATION');
  return {
    client: { id: client.id, name: parseData(client.data).name || client.title, number: client.number, status: client.status },
    wallet: w ? { id: w.id, balance: units(w.balanceCents), currency: w.currency, createdAt: w.createdAt.toISOString() }
              : { id: null, balance: 0, currency: a.org.baseCurrency || 'USD', createdAt: null },
    ledger: txs.map(txView),
    projects,
    totals: {
      toppedUp: units(allocations.length ? txs.filter(t => t.kind === 'TOPUP').reduce((n, t) => n + t.amountCents, 0) : txs.filter(t => t.kind === 'TOPUP').reduce((n, t) => n + t.amountCents, 0)),
      allocated: units(-allocations.filter(t => !t.reversedAt).reduce((n, t) => n + t.amountCents, 0)),
      transactions: txs.length,
    },
  };
}

export async function topUpWallet(a: AuthCtx, clientId: string, body: any) {
  const cents = toCents(body.amount);
  const key = str(body.idempotencyKey, 120);
  const currency = a.org.baseCurrency || 'USD';
  return prisma.$transaction(async tx => {
    await clientRow(tx, a.orgId, clientId);
    if (key && await tx.walletTransaction.findFirst({ where: { organizationId: a.orgId, idempotencyKey: key }, select: { id: true } }))
      throw new WalletError('Duplicate request — these funds were already added', 409);
    const w = await getOrCreateWallet(tx, a.orgId, clientId, currency);
    const balance = w.balanceCents + cents;
    const t = await tx.walletTransaction.create({ data: {
      organizationId: a.orgId, walletId: w.id, clientId, kind: 'TOPUP', amountCents: cents,
      balanceCents: balance, currency: w.currency || currency,
      reference: str(body.reference, 120), method: str(body.method, 80), note: str(body.note, 500),
      actorId: a.userId, actorName: a.name, idempotencyKey: key,
    }});
    await tx.wallet.update({ where: { id: w.id }, data: { balanceCents: balance } });
    await mirrorDerived(tx, a.orgId, clientId, balance);
    await tx.auditLog.create({ data: { organizationId: a.orgId, userId: a.userId, actor: a.name, action: 'WALLET_TOPUP', resource: 'clients',
      detail: `Added ${units(cents).toLocaleString('en-ZW')} ${w.currency || currency} to the wallet of ${clientId.slice(-8)} (balance ${units(balance).toLocaleString('en-ZW')})` } });
    return { transaction: txView(t), balance: units(balance) };
  });
}

export async function allocateToProject(a: AuthCtx, clientId: string, body: any) {
  const cents = toCents(body.amount);
  const projectId = String(body.projectId || '');
  const key = str(body.idempotencyKey, 120);
  const currency = a.org.baseCurrency || 'USD';
  return prisma.$transaction(async tx => {
    if (key && await tx.walletTransaction.findFirst({ where: { organizationId: a.orgId, idempotencyKey: key }, select: { id: true } }))
      throw new WalletError('Duplicate request — this funding was already applied', 409);
    const project = await tx.record.findFirst({ where: { id: projectId, organizationId: a.orgId, resource: 'projects', deletedAt: null }, select: { id: true, data: true, title: true } });
    if (!project) throw new WalletError('Project not found', 404);
    const pd = parseData(project.data);
    if (pd.clientId !== clientId) throw new WalletError('That project belongs to a different client — funds cannot be moved between clients');
    const w = await getOrCreateWallet(tx, a.orgId, clientId, currency);
    if (w.balanceCents < cents) throw new WalletError(`Insufficient wallet balance. Available: ${units(w.balanceCents).toLocaleString('en-ZW')} ${w.currency || currency}`, 409);
    const balance = w.balanceCents - cents;
    const t = await tx.walletTransaction.create({ data: {
      organizationId: a.orgId, walletId: w.id, clientId, projectId, kind: 'ALLOCATION', amountCents: -cents,
      balanceCents: balance, currency: w.currency || currency,
      reference: str(body.reference, 120), note: str(body.note, 500) || `Funding for ${pd.name || project.title}`,
      actorId: a.userId, actorName: a.name, idempotencyKey: key,
    }});
    await tx.wallet.update({ where: { id: w.id }, data: { balanceCents: balance } });
    await mirrorDerived(tx, a.orgId, clientId, balance, projectId);
    await tx.auditLog.create({ data: { organizationId: a.orgId, userId: a.userId, actor: a.name, action: 'WALLET_ALLOCATION', resource: 'projects',
      detail: `Funded ${pd.name || project.title} with ${units(cents).toLocaleString('en-ZW')} ${w.currency || currency} from the client wallet (balance ${units(balance).toLocaleString('en-ZW')})` } });
    await tx.notification.create({ data: { organizationId: a.orgId, title: 'Project funded from client wallet',
      body: `${units(cents).toLocaleString('en-ZW')} ${w.currency || currency} allocated to ${pd.name || project.title}.`, kind: 'SUCCESS', href: `/projects/${projectId}` } });
    return { transaction: txView(t), balance: units(balance) };
  });
}

export async function reverseTransaction(a: AuthCtx, clientId: string, body: any) {
  const txId = String(body.transactionId || '');
  const note = str(body.note, 500);
  return prisma.$transaction(async tx => {
    const w = await tx.wallet.findUnique({ where: { organizationId_clientId: { organizationId: a.orgId, clientId } } });
    if (!w) throw new WalletError('Wallet not found', 404);
    const orig = await tx.walletTransaction.findFirst({ where: { id: txId, walletId: w.id, organizationId: a.orgId } });
    if (!orig) throw new WalletError('Ledger entry not found', 404);
    if (orig.kind === 'REVERSAL') throw new WalletError('A reversal cannot itself be reversed');
    if (orig.reversedAt) throw new WalletError('This entry has already been reversed');
    const reverseCents = -orig.amountCents;
    const balance = w.balanceCents + reverseCents;
    if (balance < 0) throw new WalletError('Wallet balance is too low to reverse this entry', 409);
    const t = await tx.walletTransaction.create({ data: {
      organizationId: a.orgId, walletId: w.id, clientId, projectId: orig.projectId,
      kind: 'REVERSAL', amountCents: reverseCents, balanceCents: balance, currency: orig.currency,
      reference: orig.reference, note: note || `Reversal of ${orig.kind.toLowerCase()} ${orig.id.slice(-8)}`,
      actorId: a.userId, actorName: a.name, reversesId: orig.id,
    }});
    await tx.walletTransaction.update({ where: { id: orig.id }, data: { reversedAt: new Date() } });
    await tx.wallet.update({ where: { id: w.id }, data: { balanceCents: balance } });
    await mirrorDerived(tx, a.orgId, clientId, balance, orig.projectId);
    await tx.auditLog.create({ data: { organizationId: a.orgId, userId: a.userId, actor: a.name, action: 'WALLET_REVERSAL', resource: 'clients',
      detail: `Reversed ${orig.kind.toLowerCase()} of ${units(Math.abs(orig.amountCents)).toLocaleString('en-ZW')} ${orig.currency} (balance ${units(balance).toLocaleString('en-ZW')})` } });
    return { transaction: txView(t), balance: units(balance) };
  });
}

/** Reconciliation used by /integrity: cached balances must equal the ledger. */
export async function walletInvariant(orgId: string) {
  const wallets = await prisma.wallet.findMany({ where: { organizationId: orgId } });
  const out: any[] = [];
  for (const w of wallets) {
    const agg = await prisma.walletTransaction.aggregate({ where: { walletId: w.id, organizationId: orgId }, _sum: { amountCents: true } });
    const ledger = agg._sum.amountCents || 0;
    if (ledger !== w.balanceCents) out.push({ walletId: w.id, clientId: w.clientId, cached: units(w.balanceCents), ledger: units(ledger) });
  }
  return out;
}
