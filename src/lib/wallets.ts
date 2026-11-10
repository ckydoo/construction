/* Client wallet service — Supabase edition.
 * Reads go through the caller's RLS-bound client. Money moves ONLY through the
 * SECURITY DEFINER RPCs in 0005_functions.sql, which re-check membership,
 * module, capability, portal scope and balance inside one transaction. The
 * ledger is append-only: corrections are REVERSAL entries. */
import type { AuthCtx } from './auth';
import type { Scope } from './access';
import { rowAllowed, walletClientAllowed } from './access';
import { supabase } from './supabase';
import { fetchAll } from './fetch';
import { normaliseCurrencyConfig, toBase, currencyBreakdown } from './currency';

export class WalletError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

const MAX_AMOUNT = 1_000_000_000;
const units = (cents: number) => Math.round(cents) / 100;
const str = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max) || null;
const dataOf = (raw: any): Record<string, any> => (raw && typeof raw === 'object') ? raw : {};

function amountOf(value: unknown): number {
  const n = Number(value);
  if (!isFinite(n) || n <= 0) throw new WalletError('Enter an amount greater than zero');
  if (n > MAX_AMOUNT) throw new WalletError('Amount is outside the allowed range');
  return Math.round(n * 100) / 100;
}

async function rpc(fn: string, args: Record<string, any>): Promise<any> {
  const sb = await supabase();
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    const msg = String(error.message || 'Wallet action failed');
    const status = /not permitted|unauthorized|row-level|role/i.test(msg) ? 403
      : /not found/i.test(msg) ? 404
      : /duplicate|already|insufficient/i.test(msg) ? 409
      : 400;
    throw new WalletError(msg, status);
  }
  return data;
}

function txView(t: any) {
  return {
    id: t.id, kind: t.kind, amount: units(t.amount_cents), balanceAfter: units(t.balance_cents),
    currency: t.currency, projectId: t.project_id, reference: t.reference, method: t.method,
    note: t.note, actorName: t.actor_name, reversesId: t.reverses_id,
    reversedAt: t.reversed_at || null, createdAt: t.created_at,
  };
}

/** All wallets in the workspace, one card per client (including zero balances). */
export async function listWallets(a: AuthCtx, scope: Scope) {
  const [clientRows, wallets, txs] = await Promise.all([
    fetchAll('records', q => q.eq('organization_id', a.orgId).eq('resource', 'clients').is('deleted_at', null), 'id,number,title,status,data'),
    fetchAll('wallets', q => q.eq('organization_id', a.orgId)),
    fetchAll('wallet_transactions', q => q.eq('organization_id', a.orgId), 'id,wallet_id,client_id,kind,amount_cents,project_id,reversed_at,created_at'),
  ]);
  const visible = clientRows.filter(c =>
    rowAllowed(scope, 'clients', { id: c.id, ...dataOf(c.data) }) && walletClientAllowed(a, c.id, scope));
  const byWallet = new Map<string, typeof txs>();
  for (const t of txs) { const arr = byWallet.get(t.wallet_id) || []; arr.push(t); byWallet.set(t.wallet_id, arr); }
  const cfg = normaliseCurrencyConfig(a.config.currency, a.org.baseCurrency);
  const currency = a.org.baseCurrency || 'USD';

  const rows = visible.map(c => {
    const d = dataOf(c.data);
    const w = wallets.find(x => x.client_id === c.id);
    const list = w ? (byWallet.get(w.id) || []) : [];
    const sumKind = (kind: string) => list.filter(t => t.kind === kind).reduce((n, t) => n + t.amount_cents, 0);
    const toppedUp = units(sumKind('TOPUP'));
    const grossAllocated = units(-sumKind('ALLOCATION'));
    const reversed = units(sumKind('REVERSAL'));
    const balance = units(w?.balance_cents || 0);
    const activeProjects = new Set(list.filter(t => t.kind === 'ALLOCATION' && !t.reversed_at && t.project_id).map(t => t.project_id)).size;
    return {
      clientId: c.id, clientName: c.title || d.name || c.number, clientNumber: c.number,
      clientStatus: c.status, walletId: w?.id || null, currency: w?.currency || currency,
      baseBalance: toBase(balance, w?.currency || currency, cfg),
      baseToppedUp: toBase(toppedUp, w?.currency || currency, cfg),
      baseNetAllocated: toBase(Math.max(0, grossAllocated - Math.max(0, reversed)), w?.currency || currency, cfg),
      balance, toppedUp, allocated: grossAllocated, reversed,
      netAllocated: Math.max(0, grossAllocated - Math.max(0, reversed)),
      projectCount: activeProjects,
      lastActivity: list.length ? new Date(Math.max(...list.map(t => new Date(t.created_at).getTime()))).toISOString() : null,
      txCount: list.length,
    };
  }).sort((x, y) => y.baseBalance - x.baseBalance || String(x.clientName).localeCompare(String(y.clientName)));

  return {
    wallets: rows, currency, baseCurrency: cfg.base,
    fx: { base: cfg.base, rates: cfg.rates, enabled: cfg.enabled, byCurrency: currencyBreakdown(rows, 'balance', cfg) },
    summary: {
      clientCount: rows.length,
      fundedWallets: rows.filter(r => r.walletId && r.txCount > 0).length,
      totalBalance: rows.reduce((n, r) => n + r.baseBalance, 0),
      baseCurrency: cfg.base,
      totalToppedUp: rows.reduce((n, r) => n + r.baseToppedUp, 0),
      totalAllocated: rows.reduce((n, r) => n + r.baseNetAllocated, 0),
      fundedProjects: rows.reduce((n, r) => n + r.projectCount, 0),
    },
  };
}

export async function walletDetail(a: AuthCtx, clientId: string, scope: Scope) {
  const sb = await supabase();
  const { data: client } = await sb.from('records').select('*')
    .eq('organization_id', a.orgId).eq('resource', 'clients').eq('id', clientId)
    .is('deleted_at', null).maybeSingle();
  if (!client) throw new WalletError('Client not found', 404);
  if (!rowAllowed(scope, 'clients', { id: clientId, ...dataOf(client.data) }) ||
      !walletClientAllowed(a, clientId, scope)) throw new WalletError('You can only view your own wallet', 403);

  const { data: w } = await sb.from('wallets').select('*')
    .eq('organization_id', a.orgId).eq('client_id', clientId).maybeSingle();
  const txs = w ? (await fetchAll('wallet_transactions', q => q.eq('wallet_id', w.id).eq('organization_id', a.orgId))) : [];
  txs.sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
  const projectsRaw = await fetchAll('records', q => q
    .eq('organization_id', a.orgId).eq('resource', 'projects').is('deleted_at', null), 'id,number,title,status,data');
  const projects = projectsRaw.filter(p => dataOf(p.data).clientId === clientId).map(p => {
    const d = dataOf(p.data);
    return { id: p.id, name: d.name || p.title || p.number, code: d.code || p.number,
      contractValue: Number(d.contractValue || 0), fundedAmount: Number(d.fundedAmount || 0),
      remainingToFund: Number(d.remainingToFund ?? Number(d.contractValue || 0)), status: p.status };
  });
  const allocations = txs.filter(t => t.kind === 'ALLOCATION');
  return {
    client: { id: client.id, name: dataOf(client.data).name || client.title, number: client.number, status: client.status },
    wallet: w ? { id: w.id, balance: units(w.balance_cents), currency: w.currency, createdAt: w.created_at }
              : { id: null, balance: 0, currency: a.org.baseCurrency || 'USD', createdAt: null },
    ledger: txs.slice(0, 200).map(txView),
    projects,
    totals: {
      toppedUp: units(txs.filter(t => t.kind === 'TOPUP').reduce((n, t) => n + t.amount_cents, 0)),
      allocated: units(-allocations.filter(t => !t.reversed_at).reduce((n, t) => n + t.amount_cents, 0)),
      transactions: txs.length,
    },
  };
}

export async function topUpWallet(a: AuthCtx, clientId: string, body: any) {
  return rpc('app_wallet_topup', {
    p_org: a.orgId, p_client_id: clientId, p_amount: amountOf(body.amount),
    p_reference: str(body.reference, 120), p_method: str(body.method, 80),
    p_note: str(body.note, 500), p_idempotency_key: str(body.idempotencyKey, 120),
  });
}

export async function allocateToProject(a: AuthCtx, clientId: string, body: any) {
  return rpc('app_wallet_allocate', {
    p_org: a.orgId, p_client_id: clientId, p_project_id: String(body.projectId || ''),
    p_amount: amountOf(body.amount), p_note: str(body.note, 500),
    p_idempotency_key: str(body.idempotencyKey, 120),
  });
}

export async function reverseTransaction(a: AuthCtx, clientId: string, body: any) {
  return rpc('app_wallet_reverse', {
    p_org: a.orgId, p_client_id: clientId,
    p_transaction_id: String(body.transactionId || ''), p_note: str(body.note, 500),
  });
}

/** Reconciliation used by /integrity: cached balances must equal the ledger. */
export async function walletInvariant(orgId: string): Promise<any[]> {
  const data = await rpc('app_wallet_invariant', { p_org: orgId });
  return Array.isArray(data) ? data : [];
}
