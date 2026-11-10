/* DPO Pay by Network v6 subscription adapter.
 *
 * Flow: 14-day NO-CARD trial -> first customer-present hosted payment with
 * <AllowRecurrent>1</AllowRecurrent> -> verifyToken -> getSubscriptionToken ->
 * chargeTokenRecurrent on later renewals. DPO push/redirect callbacks are only
 * doorbells: verifyToken plus exact amount/currency/reference matching is the
 * source of truth. No card data ever reaches MYLA. Stripe is not used.
 *
 * DPO production and sandbox share one endpoint. `DPO_LIVE_MODE=true` plus a
 * production CompanyToken is required before live calls are permitted. The
 * local QA mock makes zero external payment requests. */
import { createHmac } from 'node:crypto';
import {
  baseUrl, billingActive, billingConfig, billingError, dpoMockEnabled,
  dpoProvider, getInvoiceByReference, getOrgCountry, getSubscription, iso,
  markWebhookProcessed, notifyBilling, recordBillingEvent,
  recordWebhookEvent, safeHashEqual, shortHash, updateInvoice,
  type BillingInvoice, type BillingSubscription,
} from './billing';
import {
  activatePaidInvoice, clearDpoTokens, markInvoiceFailed,
  type WalletTokens,
} from './billing-lifecycle';
import { PLAN_MAP, planAmountFixed, type PlanId } from './billing-plans';

export type DpoContext = {
  reference?: string;
  amount?: string;
  email?: string;
  mode?: 'hosted' | 'recurring';
  transactionToken?: string;
  subscriptionToken?: string;
  planId?: PlanId;
};

export type DpoVerification = {
  paid: boolean; pending: boolean; failed: boolean;
  result: string; explanation: string; rawStatus: string | null;
  amount: string | null; currency: string | null; approval: string | null;
};

export type DpoAttemptResult = {
  ok: boolean; paid?: boolean; pending?: boolean; failed?: boolean; reason?: string;
};

/* ───────────────────────── XML / signature helpers ───────────────────────── */

export function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
export function dpoTag(name: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return `<${name}>${escapeXml(value)}</${name}>`;
}
function dpoRawTag(name: string, raw: string): string { return `<${name}>${raw}</${name}>`; }

export function parseDpoXml(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<([A-Za-z0-9_]+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(raw || '')))) {
    const value = String(m[2] ?? m[3] ?? '').trim();
    out[m[1]] = value;
    out[m[1].toLowerCase()] = value;
  }
  return out;
}
export function xmlValue(map: Record<string, string>, name: string): string {
  return String(map[name] ?? map[name.toLowerCase()] ?? '').trim();
}

function callbackSecret(): string {
  const cfg = billingConfig();
  return cfg.mode === 'qa'
    ? (cfg.qaSecret || cfg.dpoCallbackSecret || 'myla-dpo-mock-key')
    : cfg.dpoCallbackSecret;
}
function pushSecret(): string {
  const cfg = billingConfig();
  return cfg.mode === 'qa'
    ? (cfg.qaSecret || cfg.dpoPushSecret || 'myla-dpo-mock-key')
    : cfg.dpoPushSecret;
}

export function dpoCallbackSignature(reference: string, secret = callbackSecret()): string {
  return createHmac('sha256', secret).update(`myla:dpo:${reference}`).digest('hex');
}
function assertCallbackAccess(req: Request, source: 'return' | 'push', reference: string, signature: string): void {
  const cfg = billingConfig();
  if (source === 'push') {
    const expected = pushSecret();
    const u = new URL(req.url);
    const supplied = u.searchParams.get('push_secret') || req.headers.get('x-dpo-push-secret') || '';
    if (!expected || !safeHashEqual(expected, supplied)) billingError('Invalid DPO push secret.', 401);
  } else {
    if (cfg.mode !== 'qa' && !cfg.dpoCallbackSecret) billingError('DPO_CALLBACK_SECRET is not configured.', 503);
    const expected = dpoCallbackSignature(reference, callbackSecret());
    if (!signature || !safeHashEqual(expected, signature)) billingError('Invalid DPO callback signature.', 401);
  }
}

function serviceDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}/${p(date.getUTCMonth() + 1)}/${p(date.getUTCDate())} ${p(date.getUTCHours())}:${p(date.getUTCMinutes())}`;
}
function splitName(name?: string | null): { first: string; last: string } {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') || '' };
}
export function buildDpoPaymentUrl(template: string, token: string): string {
  const encoded = encodeURIComponent(token);
  if (template.includes('{token}')) return template.replace('{token}', encoded);
  return `${template}${template.includes('?') ? '&' : '?'}ID=${encoded}`;
}

/* ───────────────────────── DPO XML request builders ───────────────────────── */

type DpoTransactionInput = {
  req?: Request;
  invoice: BillingInvoice;
  slug: string;
  planId: PlanId;
  email?: string | null;
  name?: string | null;
  country?: string | null;
  mode: 'hosted' | 'recurring';
};

function buildCreateTokenXml(input: DpoTransactionInput): string {
  const cfg = billingConfig();
  const reference = input.invoice.reference;
  const amount = Number(input.invoice.amount_usd).toFixed(2);
  const origin = baseUrl(input.req);
  const returnUrl = input.mode === 'hosted'
    ? (() => {
        const u = new URL('/api/webhooks/dpo', origin);
        u.searchParams.set('source', 'return');
        u.searchParams.set('reference', reference);
        u.searchParams.set('sig', dpoCallbackSignature(reference));
        return u.toString();
      })()
    : '';
  const backUrl = input.mode === 'hosted'
    ? `${origin}/${encodeURIComponent(input.slug)}/billing?dpo=cancelled&reference=${encodeURIComponent(reference)}`
    : '';
  const name = splitName(input.name);
  const country = String(input.country || '').trim().toUpperCase();
  const meta = JSON.stringify({
    orgId: input.invoice.organization_id, invoiceId: input.invoice.id,
    reference, planId: input.planId, mode: input.mode,
  });
  const transaction = [
    dpoTag('PaymentAmount', amount),
    dpoTag('PaymentCurrency', 'USD'),
    dpoTag('CompanyRef', reference),
    dpoTag('CompanyRefUnique', '1'),
    returnUrl ? dpoTag('RedirectURL', returnUrl) : '',
    backUrl ? dpoTag('BackURL', backUrl) : '',
    cfg.dpoRecurringEnabled ? dpoTag('AllowRecurrent', '1') : '',
    input.email ? dpoTag('customerEmail', input.email) : '',
    name.first ? dpoTag('customerFirstName', name.first) : '',
    name.last ? dpoTag('customerLastName', name.last) : '',
    country ? dpoTag('customerCountry', country) : '',
    dpoTag('TransactionSource', 'Website'),
    dpoRawTag('MetaData', `<![CDATA[${meta}]]>`),
  ].join('');
  const serviceType = cfg.dpoServiceType || (cfg.mode === 'qa' ? '5525' : '');
  const service = [
    serviceType ? dpoTag('ServiceType', serviceType) : '',
    !serviceType && cfg.dpoServiceTypeName ? dpoTag('ServiceTypeName', cfg.dpoServiceTypeName) : '',
    dpoTag('ServiceDescription', `MYLA ${PLAN_MAP[input.planId].name} monthly organisation plan`),
    dpoTag('ServiceDate', serviceDate(new Date())),
    dpoTag('ServiceRef', reference),
  ].join('');
  return `<?xml version="1.0" encoding="utf-8"?><API3G>` +
    dpoTag('CompanyToken', cfg.dpoCompanyToken || 'MOCK-DPO-TOKEN') +
    dpoTag('Request', 'createToken') +
    `<Transaction>${transaction}</Transaction><Services><Service>${service}</Service></Services></API3G>`;
}

function buildVerifyTokenXml(transactionToken: string, companyRef: string): string {
  const cfg = billingConfig();
  return `<?xml version="1.0" encoding="utf-8"?><API3G>` +
    dpoTag('CompanyToken', cfg.dpoCompanyToken || 'MOCK-DPO-TOKEN') +
    dpoTag('Request', 'verifyToken') +
    dpoTag('TransactionToken', transactionToken) +
    dpoTag('CompanyRef', companyRef) +
    dpoTag('VerifyTransaction', '1') +
    `</API3G>`;
}

function buildGetSubscriptionTokenXml(email: string): string {
  const cfg = billingConfig();
  return `<?xml version="1.0" encoding="utf-8"?><API3G>` +
    dpoTag('CompanyToken', cfg.dpoCompanyToken || 'MOCK-DPO-TOKEN') +
    dpoTag('Request', 'getSubscriptionToken') +
    dpoTag('SearchCriteria', '1') +
    dpoTag('SearchCriteriaValue', email) +
    `</API3G>`;
}

function buildChargeTokenRecurrentXml(transactionToken: string, subscriptionToken: string): string {
  const cfg = billingConfig();
  return `<?xml version="1.0" encoding="utf-8"?><API3G>` +
    dpoTag('CompanyToken', cfg.dpoCompanyToken || 'MOCK-DPO-TOKEN') +
    dpoTag('Request', 'chargeTokenRecurrent') +
    dpoTag('TransactionToken', transactionToken) +
    dpoTag('subscriptionToken', subscriptionToken) +
    `</API3G>`;
}

function buildDeleteCardXml(customerToken: string, subscriptionToken: string): string {
  const cfg = billingConfig();
  return `<?xml version="1.0" encoding="utf-8"?><API3G>` +
    dpoTag('CompanyToken', cfg.dpoCompanyToken || 'MOCK-DPO-TOKEN') +
    dpoTag('Request', 'deleteCard') +
    dpoTag('customerToken', customerToken) +
    dpoTag('subscriptionToken', subscriptionToken) +
    `</API3G>`;
}

/* ───────────────────────── API transport + local mock ─────────────────────── */

async function postDpoXml(xml: string): Promise<Record<string, string>> {
  const cfg = billingConfig();
  const res = await fetch(cfg.dpoApiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml; charset=utf-8', Accept: 'application/xml' },
    body: xml,
    cache: 'no-store',
  });
  const raw = await res.text();
  const map = parseDpoXml(raw);
  if (!res.ok) billingError(`DPO API returned HTTP ${res.status}: ${xmlValue(map, 'ResultExplanation') || 'request failed'}`, 502);
  return map;
}

async function mockDpoRequest(requestName: string, xml: string, context: DpoContext): Promise<Record<string, string>> {
  const map = parseDpoXml(xml);
  const reference = context.reference || xmlValue(map, 'CompanyRef') || '';
  const invoice = reference ? await getInvoiceByReference(reference) : null;
  const amount = invoice ? Number(invoice.amount_usd).toFixed(2) : (context.amount || '0.00');
  const email = context.email || xmlValue(map, 'SearchCriteriaValue') || '';
  const tokenSeed = `${reference}:${context.mode || ''}:${Date.now()}:${Math.random()}`;

  if (requestName === 'createToken') {
    return {
      Result: '000', ResultExplanation: 'Transaction created',
      TransToken: `MOCK-${shortHash(tokenSeed).toUpperCase()}`,
      TransRef: reference,
    };
  }
  if (requestName === 'verifyToken') {
    const dpo = invoice?.metadata?.dpo || {};
    const paid = dpo.mockPaid === true;
    const chargeResult = String(dpo.mockChargeResult || '000');
    const result = paid ? '000' : chargeResult === '901' ? '901' : chargeResult === '888' ? '900' : '900';
    return {
      Result: result,
      ResultExplanation: result === '000' ? 'Transaction Paid' : result === '901' ? 'Transaction declined' : 'Transaction not paid yet',
      CompanyRef: reference,
      TransactionAmount: result === '000' ? amount : amount,
      TransactionCurrency: 'USD',
      TransactionApproval: result === '000' ? `MOCKAPP${shortHash(reference).slice(0, 8).toUpperCase()}` : '',
    };
  }
  if (requestName === 'getSubscriptionToken') {
    return {
      Result: '000', ResultExplanation: 'Success',
      SubscriptionToken: `MOCK-SUB-${shortHash(email || reference).toUpperCase()}`,
      CustomerToken: `MOCK-CUS-${shortHash(email || reference).toUpperCase()}`,
    };
  }
  if (requestName === 'chargeTokenRecurrent') {
    const dpo = invoice?.metadata?.dpo || {};
    const result = String(dpo.mockChargeResult || '000');
    if (result === '000' && invoice) {
      await updateInvoice(invoice.id, {
        metadata: {
          ...(invoice.metadata || {}),
          dpo: { ...dpo, mockPaid: true, lastMockChargeAt: new Date().toISOString() },
        },
      });
    }
    return {
      Result: result,
      ResultExplanation: result === '000' ? 'Transaction successful' : result === '901' ? 'Transaction declined' : 'System error',
    };
  }
  if (requestName === 'deleteCard') {
    return { Result: '000', ResultExplanation: 'Card been deleted' };
  }
  return { Result: '803', ResultExplanation: 'Invalid or missing Request name' };
}

async function callDpoApi(requestName: string, xml: string, context: DpoContext = {}): Promise<Record<string, string>> {
  const cfg = billingConfig();
  if (!billingActive()) billingError('Billing is in shadow mode.', 503);
  if (cfg.mode === 'qa') {
    if (!dpoMockEnabled()) billingError('QA DPO_MOCK must be enabled; no external DPO call is allowed in QA.', 503);
    return mockDpoRequest(requestName, xml, context);
  }
  if (!cfg.dpoReady) billingError('DPO live credentials and explicit DPO_LIVE_MODE=true are required.', 503);
  return postDpoXml(xml);
}

async function createDpoTransaction(input: DpoTransactionInput): Promise<{ token: string; reference: string }> {
  const cfg = billingConfig();
  if (!cfg.dpoReady) billingError('DPO is not configured for checkout.', 503);
  if (input.invoice.status !== 'pending') billingError('This invoice is no longer awaiting payment.', 409);
  const expected = planAmountFixed(input.planId);
  if (Number(input.invoice.amount_usd).toFixed(2) !== expected) billingError('Invoice amount does not match the selected plan.', 409);
  // customerCountry is optional. Use the onboarding country where available;
  // never hardcode ZW, because the same USD prices apply everywhere.
  const country = input.country ?? await getOrgCountry(input.invoice.organization_id);
  const xml = buildCreateTokenXml({ ...input, country });
  const map = await callDpoApi('createToken', xml, {
    reference: input.invoice.reference,
    amount: expected,
    email: input.email || undefined,
    mode: input.mode,
    planId: input.planId,
  });
  const result = xmlValue(map, 'Result');
  const token = xmlValue(map, 'TransToken');
  if (result !== '000' || !token) billingError(`DPO createToken failed: ${xmlValue(map, 'ResultExplanation') || result}`, 502);
  return { token, reference: xmlValue(map, 'TransRef') || input.invoice.reference };
}

/* ───────────────────────── Hosted checkout / callbacks ───────────────────── */

export async function startDpoCheckout(input: {
  req: Request; orgId: string; slug: string; planId: PlanId;
  email?: string | null; name?: string | null;
  invoice: BillingInvoice; sub: BillingSubscription;
}) {
  const cfg = billingConfig();
  if (!billingActive()) billingError('Billing is in shadow mode.', 503);
  if (!cfg.dpoReady) billingError('DPO is not configured for checkout.', 503);
  if (!['dpo','mock'].includes(input.invoice.gateway)) billingError('This invoice is not a DPO invoice.', 400);
  const created = await createDpoTransaction({
    req: input.req, invoice: input.invoice, slug: input.slug, planId: input.planId,
    email: input.email || input.sub.dpo_customer_email, name: input.name, mode: 'hosted',
  });
  const origin = baseUrl(input.req);
  const dpoMeta = {
    ...(input.invoice.metadata?.dpo || {}),
    allowRecurrent: cfg.dpoRecurringEnabled,
    email: input.email || input.sub.dpo_customer_email || null,
    mock: cfg.mode === 'qa',
    transactionToken: created.token,
    companyRef: created.reference,
    createdAt: new Date().toISOString(),
  };
  let hostedUrl: string;
  let pollUrl: string | null = null;
  if (dpoMockEnabled()) {
    const hosted = new URL('/api/qa/billing/dpo-checkout', origin);
    hosted.searchParams.set('reference', created.reference);
    hosted.searchParams.set('token', created.token);
    hosted.searchParams.set('org', input.slug);
    if (cfg.qaSecret) hosted.searchParams.set('qa_secret', cfg.qaSecret);
    hostedUrl = hosted.toString();
    const cb = new URL('/api/webhooks/dpo', origin);
    cb.searchParams.set('source', 'return');
    cb.searchParams.set('reference', created.reference);
    cb.searchParams.set('sig', dpoCallbackSignature(created.reference));
    pollUrl = cb.toString();
  } else {
    hostedUrl = buildDpoPaymentUrl(cfg.dpoPaymentUrlTemplate, created.token);
    const cb = new URL('/api/webhooks/dpo', origin);
    cb.searchParams.set('source', 'return');
    cb.searchParams.set('reference', created.reference);
    cb.searchParams.set('sig', dpoCallbackSignature(created.reference));
    pollUrl = cb.toString();
  }
  await updateInvoice(input.invoice.id, {
    hosted_url: hostedUrl, poll_url: pollUrl, gateway_reference: created.token,
    metadata: { ...(input.invoice.metadata || {}), dpo: dpoMeta },
  });
  await recordBillingEvent(input.orgId, 'dpo_checkout_created', created.reference,
    `DPO token ${created.token} created. AllowRecurrent=${cfg.dpoRecurringEnabled ? 1 : 0}.`);
  return {
    url: hostedUrl, pollUrl, reference: created.reference,
    token: created.token, mock: dpoMockEnabled(),
    allowRecurrent: cfg.dpoRecurringEnabled,
  };
}

export async function verifyDpoTransaction(input: {
  invoice: BillingInvoice; transactionToken: string; companyRef: string;
}): Promise<DpoVerification> {
  const cfg = billingConfig();
  if (!cfg.dpoReady) billingError('DPO is not configured for verification.', 503);
  const xml = buildVerifyTokenXml(input.transactionToken, input.companyRef);
  const map = await callDpoApi('verifyToken', xml, {
    reference: input.companyRef, transactionToken: input.transactionToken,
  });
  const result = xmlValue(map, 'Result') || '900';
  const explanation = xmlValue(map, 'ResultExplanation') || `DPO result ${result}`;
  const amountRaw = xmlValue(map, 'TransactionAmount');
  const currency = xmlValue(map, 'TransactionCurrency').toUpperCase();
  const companyRef = xmlValue(map, 'CompanyRef');
  const expectedAmount = Number(input.invoice.amount_usd).toFixed(2);
  const amountOk = Boolean(amountRaw) && Number(amountRaw).toFixed(2) === expectedAmount;
  const currencyOk = currency === 'USD';
  const refOk = !companyRef || companyRef === input.companyRef;
  const paid = result === '000' && amountOk && currencyOk && refOk;
  const failed = ['002','901','902','903','904'].includes(result) || (result === '000' && !paid);
  const pending = !paid && !failed && ['900','001','003','005','007','888'].includes(result);
  return {
    paid, pending, failed, result,
    explanation: paid ? explanation : (result === '000' ? 'DPO amount/currency/reference mismatch' : explanation),
    rawStatus: result, amount: amountRaw || null, currency: currency || null,
    approval: xmlValue(map, 'TransactionApproval') || null,
  };
}

export async function getDpoWalletTokens(email?: string | null): Promise<WalletTokens | null> {
  const cfg = billingConfig();
  if (!cfg.dpoReady || !cfg.dpoRecurringEnabled || !email) return null;
  const xml = buildGetSubscriptionTokenXml(email);
  const map = await callDpoApi('getSubscriptionToken', xml, { email });
  const result = xmlValue(map, 'Result');
  const subscriptionToken = xmlValue(map, 'SubscriptionToken');
  const customerToken = xmlValue(map, 'CustomerToken');
  if (result !== '000' || !subscriptionToken || !customerToken) {
    await recordBillingEvent('', 'dpo_wallet_lookup_failed', shortHash(email), `Result ${result}: ${xmlValue(map, 'ResultExplanation')}`);
    return null;
  }
  return { subscriptionToken, customerToken };
}

export async function processDpoCallback(req: Request, source: 'return' | 'push', rawBody = '') {
  const cfg = billingConfig();
  if (!billingActive()) billingError('Billing is disabled.', 503);
  if (!cfg.dpoReady) billingError('DPO is not configured.', 503);
  const url = new URL(req.url);
  const xmlMap = parseDpoXml(rawBody);
  const reference = url.searchParams.get('reference')
    || url.searchParams.get('CompanyRef')
    || url.searchParams.get('companyref')
    || xmlValue(xmlMap, 'TransactionRef')
    || xmlValue(xmlMap, 'CompanyRef')
    || '';
  const signature = url.searchParams.get('sig') || '';
  assertCallbackAccess(req, source, reference, signature);
  if (!reference) billingError('DPO callback is missing its company reference.', 400);
  const invoice = await getInvoiceByReference(reference);
  if (!invoice || !['dpo','mock'].includes(invoice.gateway) || !invoice.metadata?.dpo)
    billingError('Unknown DPO invoice reference.', 400);
  const transactionToken = url.searchParams.get('TransactionToken')
    || url.searchParams.get('token')
    || xmlValue(xmlMap, 'TransactionToken')
    || invoice.gateway_reference
    || invoice.metadata?.dpo?.transactionToken
    || '';
  if (!transactionToken) billingError('DPO callback is missing its transaction token.', 400);

  const provider = dpoProvider();
  const eventId = shortHash(`${source}:${reference}:${transactionToken}:${rawBody}:${url.search}`);
  const inserted = await recordWebhookEvent(provider, eventId, `dpo.${source}`, {
    source, reference, transactionToken, result: xmlValue(xmlMap, 'Result') || null,
  });
  if (!inserted) return { ok: true, duplicate: true, reference };
  if (invoice.status === 'paid') {
    await markWebhookProcessed(provider, eventId);
    return { ok: true, duplicate: true, reference };
  }

  const verification = await verifyDpoTransaction({ invoice, transactionToken, companyRef: reference });
  if (verification.paid) {
    const sub = await getSubscription(invoice.organization_id);
    const email = sub?.dpo_customer_email || invoice.metadata?.dpo?.email || null;
    const wallet = cfg.dpoRecurringEnabled && invoice.metadata?.dpo?.allowRecurrent !== false
      ? await getDpoWalletTokens(email)
      : null;
    await activatePaidInvoice(invoice, {
      gateway: provider, gatewayReference: transactionToken,
      transactionToken, wallet, email,
      rawStatus: verification.rawStatus, approval: verification.approval,
    });
    await markWebhookProcessed(provider, eventId);
    return { ok: true, paid: true, reference, tokenised: Boolean(wallet), result: verification.result };
  }
  if (verification.failed) {
    await markInvoiceFailed(invoice, `DPO ${verification.result}: ${verification.explanation}`, verification.rawStatus);
    await markWebhookProcessed(provider, eventId);
    return { ok: true, paid: false, failed: true, reference, result: verification.result };
  }
  await recordBillingEvent(invoice.organization_id, 'dpo_verification_pending', eventId,
    `DPO ${verification.result}: ${verification.explanation}. Callback will be retried or polled by cron.`);
  return { ok: false, retry: true, pending: true, reference, result: verification.result };
}

/* ───────────────────────── Recurring renewals / card revocation ───────────── */

export async function attemptDpoRenewal(
  sub: BillingSubscription,
  invoice: BillingInvoice,
  now = new Date(),
): Promise<DpoAttemptResult> {
  const cfg = billingConfig();
  if (!cfg.dpoReady || !cfg.dpoRecurringEnabled || !sub.dpo_subscription_token || !invoice.metadata?.dpo)
    return { ok: false, reason: 'recurring_not_available' };

  const existingAttempts = Array.isArray(invoice.metadata.dpo.chargeAttempts)
    ? invoice.metadata.dpo.chargeAttempts as any[] : [];
  if (existingAttempts.length) {
    const last = existingAttempts[existingAttempts.length - 1];
    const verification = await verifyDpoTransaction({
      invoice, transactionToken: String(last.transactionToken || ''), companyRef: invoice.reference,
    });
    if (verification.paid) {
      await activatePaidInvoice(invoice, {
        gateway: dpoProvider(), gatewayReference: String(last.transactionToken || ''),
        transactionToken: String(last.transactionToken || ''), wallet: null,
        email: sub.dpo_customer_email, rawStatus: verification.rawStatus,
        approval: verification.approval,
      });
      return { ok: true, paid: true };
    }
    if (verification.failed) {
      await markInvoiceFailed(invoice, `DPO renewal ${verification.result}: ${verification.explanation}`, verification.rawStatus);
      return { ok: false, failed: true, reason: verification.result };
    }
    return { ok: false, pending: true, reason: `charge_${last.chargeResult || 'unknown'}_verify_${verification.result}` };
  }

  const fresh = await createDpoTransaction({
    invoice, slug: '', planId: invoice.plan_id,
    email: sub.dpo_customer_email, name: null, mode: 'recurring',
  });
  const chargeXml = buildChargeTokenRecurrentXml(fresh.token, sub.dpo_subscription_token);
  const chargeMap = await callDpoApi('chargeTokenRecurrent', chargeXml, {
    reference: invoice.reference, transactionToken: fresh.token,
    subscriptionToken: sub.dpo_subscription_token,
  });
  const chargeResult = xmlValue(chargeMap, 'Result') || '888';
  const chargeExplanation = xmlValue(chargeMap, 'ResultExplanation') || 'No explanation';

  // Re-read after the mock/real charge: the mock may have already recorded a
  // successful payment in the invoice metadata. Never overwrite that state.
  const afterCharge = await getInvoiceByReference(invoice.reference) || invoice;
  const attempts = [
    ...(Array.isArray(afterCharge.metadata?.dpo?.chargeAttempts) ? afterCharge.metadata.dpo.chargeAttempts : []),
    {
      at: iso(now), transactionToken: fresh.token,
      subscriptionToken: sub.dpo_subscription_token,
      chargeResult, chargeExplanation,
    },
  ];
  await updateInvoice(afterCharge.id, {
    gateway_reference: fresh.token,
    metadata: {
      ...(afterCharge.metadata || {}),
      dpo: { ...(afterCharge.metadata?.dpo || {}), chargeAttempts: attempts },
    },
  });
  const withAttempt = await getInvoiceByReference(invoice.reference) || afterCharge;
  await recordBillingEvent(invoice.organization_id, 'dpo_recurring_charge_attempt', fresh.token,
    `chargeTokenRecurrent result ${chargeResult}: ${chargeExplanation}`);

  const verification = await verifyDpoTransaction({
    invoice: withAttempt, transactionToken: fresh.token, companyRef: invoice.reference,
  });
  if (verification.paid) {
    await activatePaidInvoice(withAttempt, {
      gateway: dpoProvider(), gatewayReference: fresh.token,
      transactionToken: fresh.token, wallet: null, email: sub.dpo_customer_email,
      rawStatus: verification.rawStatus, approval: verification.approval,
    });
    return { ok: true, paid: true };
  }
  if (verification.failed) {
    await markInvoiceFailed(withAttempt, `DPO renewal ${verification.result}: ${verification.explanation}`, verification.rawStatus);
    return { ok: false, failed: true, reason: verification.result };
  }
  return { ok: false, pending: true, reason: `charge_${chargeResult}_verify_${verification.result}` };
}

export async function revokeDpoCard(sub: BillingSubscription): Promise<void> {
  if (!sub.dpo_subscription_token) return;
  const cfg = billingConfig();
  try {
    if (cfg.dpoReady && cfg.dpoRecurringEnabled && sub.dpo_customer_token) {
      const xml = buildDeleteCardXml(sub.dpo_customer_token, sub.dpo_subscription_token);
      const map = await callDpoApi('deleteCard', xml, {});
      if (xmlValue(map, 'Result') !== '000') {
        await recordBillingEvent(sub.organization_id, 'dpo_card_revoke_warning', sub.dpo_subscription_token,
          `deleteCard result ${xmlValue(map, 'Result')}: ${xmlValue(map, 'ResultExplanation')}`);
      }
    }
  } catch (e: any) {
    await recordBillingEvent(sub.organization_id, 'dpo_card_revoke_warning', sub.dpo_subscription_token,
      `DPO deleteCard failed; local tokens were still cleared: ${e?.message || e}`);
  }
  await clearDpoTokens(sub.organization_id);
  await notifyBilling(sub.organization_id, 'Saved payment method removed',
    'Automatic DPO renewals are off for this workspace. Your business data was not changed.', 'INFO', '/billing');
}
