/* Paynow Zimbabwe fallback monthly checkout / invoice flow.
 * No tokenisation or silent autodebit is used: each month the customer pays a
 * customer-present Paynow transaction. Hash verification, exact reference and
 * amount matching, polling confirmation and webhook idempotency are mandatory.
 * Stripe is no longer used. */
import { createHash } from 'node:crypto';
import {
  baseUrl, billingActive, billingConfig, billingError, getInvoiceByReference,
  markWebhookProcessed, paynowMockEnabled, recordBillingEvent,
  recordWebhookEvent, safeHashEqual, shortHash, updateInvoice,
  type BillingInvoice, type BillingSubscription,
} from './billing';
import { activatePaidInvoice, markInvoiceFailed } from './billing-lifecycle';
import { PLAN_MAP, planAmountFixed, type PlanId } from './billing-plans';

type FormPair = [string, string];
type ParsedForm = { pairs: FormPair[]; map: Record<string, string> };

function decodeComponent(value: string): string {
  try { return decodeURIComponent(String(value || '').replace(/\+/g, ' ')); }
  catch { return String(value || '').replace(/\+/g, ' '); }
}
export function parseUrlEncoded(raw: string): ParsedForm {
  const pairs: FormPair[] = [];
  for (const part of String(raw || '').split('&').filter(Boolean)) {
    const at = part.indexOf('=');
    const key = decodeComponent(at < 0 ? part : part.slice(0, at));
    const value = decodeComponent(at < 0 ? '' : part.slice(at + 1));
    pairs.push([key, value]);
  }
  const map: Record<string, string> = {};
  for (const [k, v] of pairs) map[k.toLowerCase()] = v;
  return { pairs, map };
}
export function paynowHash(values: string[], key: string): string {
  return createHash('sha512').update(values.join('') + key, 'utf8').digest('hex').toUpperCase();
}
export function verifyPaynowForm(raw: string, key: string): ParsedForm & { valid: boolean; calculated: string } {
  const parsed = parseUrlEncoded(raw);
  const supplied = String(parsed.map.hash || '').toUpperCase();
  const calculated = paynowHash(parsed.pairs.filter(([k]) => k.toLowerCase() !== 'hash').map(([, v]) => v), key);
  return { ...parsed, valid: safeHashEqual(supplied, calculated), calculated };
}
function formBody(fields: Record<string, string>, key: string): string {
  const values = Object.values(fields);
  const hash = paynowHash(values, key);
  return new URLSearchParams({ ...fields, hash }).toString();
}

/** Hash-verified Paynow initiate request. `tokenize` is intentionally absent. */
export async function startPaynowCheckout(input: {
  req: Request; orgId: string; slug: string; planId: PlanId; email: string;
  invoice: BillingInvoice; sub: BillingSubscription;
}) {
  const cfg = billingConfig();
  if (!billingActive()) billingError('Billing is in shadow mode.', 503);
  if (!cfg.paynowReady) billingError('Paynow integration ID and key are not configured.', 503);
  if (input.invoice.status !== 'pending') billingError('This invoice is no longer awaiting payment.', 409);
  const expected = planAmountFixed(input.planId);
  if (Number(input.invoice.amount_usd).toFixed(2) !== expected) billingError('Invoice amount does not match the selected plan.', 409);
  const origin = baseUrl(input.req);
  const reference = input.invoice.reference;
  const amount = Number(input.invoice.amount_usd).toFixed(2);
  const returnUrl = cfg.paynowReturnUrl || `${origin}/${encodeURIComponent(input.slug)}/billing?paynow=return&reference=${encodeURIComponent(reference)}`;
  const resultUrl = cfg.paynowResultUrl || `${origin}/api/webhooks/paynow`;
  const fields: Record<string, string> = {
    id: cfg.paynowId,
    reference,
    amount,
    additionalinfo: `MYLA ${PLAN_MAP[input.planId].name} monthly subscription`,
    returnurl: returnUrl,
    resulturl: resultUrl,
    status: 'Message',
  };
  if (input.email) fields.authemail = input.email;

  if (paynowMockEnabled()) {
    const paynowReference = `MOCK-${shortHash(reference).toUpperCase()}`;
    const pollUrl = new URL('/api/webhooks/paynow/mock-poll', origin);
    pollUrl.searchParams.set('reference', reference);
    if (cfg.qaSecret) pollUrl.searchParams.set('qa_secret', cfg.qaSecret);
    const hosted = new URL('/api/webhooks/paynow/mock', origin);
    hosted.searchParams.set('reference', reference);
    if (cfg.qaSecret) hosted.searchParams.set('qa_secret', cfg.qaSecret);
    const pollUrlValue = pollUrl.toString();
    const hostedUrl = hosted.toString();
    await updateInvoice(input.invoice.id, {
      hosted_url: hostedUrl, poll_url: pollUrlValue, gateway_reference: paynowReference,
      metadata: { ...(input.invoice.metadata || {}), paynowMock: true },
    });
    return { url: hostedUrl, pollUrl: pollUrlValue, mock: true, reference };
  }

  const body = formBody(fields, cfg.paynowKey);
  const res = await fetch(cfg.paynowInitiateUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  const text = await res.text();
  const verified = verifyPaynowForm(text, cfg.paynowKey);
  if (!res.ok || !verified.valid || String(verified.map.status || '').toLowerCase() !== 'ok') {
    billingError(`Paynow initiate failed: ${verified.map.error || 'invalid response or hash'}`, 502);
  }
  const browserUrl = verified.map.browserurl;
  if (!browserUrl) billingError('Paynow did not return a checkout URL.', 502);
  await updateInvoice(input.invoice.id, {
    hosted_url: browserUrl, poll_url: verified.map.pollurl || null,
    gateway_reference: verified.map.paynowreference || null,
    metadata: { ...(input.invoice.metadata || {}), paynowInitiateStatus: verified.map.status },
  });
  return { url: browserUrl, pollUrl: verified.map.pollurl || null, mock: false, reference };
}

function pollUrlAllowed(raw: string, origin: string): boolean {
  try {
    const u = new URL(raw);
    const localHost = new URL(origin).host;
    // In production Paynow poll URLs are HTTPS. Local QA may use the server's
    // own HTTP origin; never follow an arbitrary host supplied by a webhook.
    if (u.protocol !== 'https:' && u.host !== localHost) return false;
    const cfg = billingConfig();
    const allowed = new Set([
      'www.paynow.co.zw', 'staging.paynow.co.zw',
      new URL(cfg.paynowInitiateUrl).host, localHost,
    ]);
    return allowed.has(u.host);
  } catch { return false; }
}

async function pollPaynowStatus(pollUrl: string, reference: string, amount: string, origin: string): Promise<boolean> {
  if (!pollUrlAllowed(pollUrl, origin)) return false;
  const cfg = billingConfig();
  const res = await fetch(pollUrl, { method: 'GET', cache: 'no-store' });
  const raw = await res.text();
  const verified = verifyPaynowForm(raw, cfg.paynowEffectiveKey);
  if (!res.ok || !verified.valid) return false;
  const status = String(verified.map.status || '').toLowerCase();
  const paid = ['paid','awaiting delivery','delivered'].includes(status);
  const refOk = String(verified.map.reference || '') === reference;
  const amountOk = Number(verified.map.amount || '').toFixed(2) === amount;
  return paid && refOk && amountOk;
}

export function buildMockPaynowPayload(input: {
  reference: string; amount: string; paynowReference?: string; pollUrl?: string;
  status?: string; key?: string;
}): string {
  const cfg = billingConfig();
  const fields: Record<string, string> = {
    reference: input.reference,
    amount: input.amount,
    paynowreference: input.paynowReference || `MOCK-${shortHash(input.reference).toUpperCase()}`,
    pollurl: input.pollUrl || '',
    status: input.status || 'Paid',
  };
  return formBody(fields, input.key || cfg.paynowEffectiveKey);
}

/** Hash-verified, idempotent Paynow status update. Returns `retry` so the route
 * can answer 5xx and let Paynow's ten-retry mechanism deliver it again. */
export async function processPaynowWebhook(raw: string, req?: Request) {
  const cfg = billingConfig();
  if (!billingActive()) billingError('Billing is disabled.', 503);
  if (!cfg.paynowReady) billingError('Paynow is not configured.', 503);
  const parsed = verifyPaynowForm(raw, cfg.paynowEffectiveKey);
  if (!parsed.valid) billingError('Invalid Paynow hash.', 400);
  const provider = cfg.mode === 'qa' ? 'mock' : 'paynow';
  const eventId = shortHash(raw);
  const inserted = await recordWebhookEvent(provider, eventId, parsed.map.status || 'status_update', parsed.map);
  if (!inserted) return { ok: true, duplicate: true, status: parsed.map.status };

  const reference = String(parsed.map.reference || '');
  const amount = Number(parsed.map.amount || '').toFixed(2);
  const invoice = await getInvoiceByReference(reference);
  if (!invoice) billingError('Unknown Paynow reference.', 400);
  if (Number(invoice.amount_usd).toFixed(2) !== amount) billingError('Paynow amount does not match the invoice.', 400);
  if (invoice.status === 'paid') {
    await markWebhookProcessed(provider, eventId);
    return { ok: true, duplicate: true, status: parsed.map.status };
  }
  const status = String(parsed.map.status || '').toLowerCase();
  const paidStatuses = ['paid','awaiting delivery','delivered'];
  const failedStatuses = ['cancelled','disputed','refunded'];

  if (paidStatuses.includes(status)) {
    // Polling confirmation is mandatory in live mode; mock mode polls its local
    // signed endpoint. A failed poll means "retry", never "assume paid".
    const pollUrl = parsed.map.pollurl || invoice.poll_url || '';
    const origin = baseUrl(req);
    if (!await pollPaynowStatus(pollUrl, reference, amount, origin)) {
      await recordBillingEvent(invoice.organization_id, 'paynow_poll_failed', eventId, 'Paynow payment not yet confirmed by poll URL.');
      return { ok: false, retry: true, reason: 'poll_confirmation_failed' };
    }
    await activatePaidInvoice(invoice, {
      gateway: provider,
      gatewayReference: parsed.map.paynowreference || invoice.gateway_reference,
      rawStatus: parsed.map.status,
    });
    await markWebhookProcessed(provider, eventId);
    return { ok: true, status: parsed.map.status, invoice: invoice.reference };
  }
  if (failedStatuses.includes(status)) {
    await markInvoiceFailed(invoice, `Paynow status ${parsed.map.status}`, parsed.map.status);
    await markWebhookProcessed(provider, eventId);
    return { ok: true, status: parsed.map.status, failed: true, invoice: invoice.reference };
  }
  await updateInvoice(invoice.id, { raw_status: parsed.map.status || null });
  await markWebhookProcessed(provider, eventId);
  return { ok: true, status: parsed.map.status, invoice: invoice.reference };
}
