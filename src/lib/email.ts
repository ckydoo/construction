/* SMTP delivery with a durable outbox. Transactional emails are attempted
 * immediately; failed or unconfigured sends remain queued for the daily sweep.
 * No live email is sent unless SMTP_HOST and SMTP_FROM are configured. */
import nodemailer from 'nodemailer';
import { createHash, randomBytes } from 'node:crypto';
import { supabaseAdmin } from './supabase';
import { renderEmailTemplate, type EmailTemplateData, type EmailTemplateKey } from './email-templates';

export type EmailCategory = 'security' | 'billing' | 'approvals' | 'tasks' | 'support' | 'digest' | 'welcome' | 'verification';

export type QueueEmailInput = {
  to: string;
  userId?: string | null;
  templateKey: EmailTemplateKey;
  subject: string;
  html: string;
  text: string;
  payload?: Record<string, unknown>;
  dedupeKey: string;
  unsubscribeUrl?: string | null;
  scheduledAt?: string;
};

export type EnqueueResult = { id: string; queued: boolean; delivered: boolean };

export function appBaseUrl(): string {
  const explicit = (process.env.EMAIL_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/$/, '');
  return 'http://127.0.0.1:3000';
}

export function preferencesUrl(orgSlug?: string | null): string {
  return orgSlug ? `${appBaseUrl()}/${encodeURIComponent(orgSlug)}/settings?tab=notifications` : `${appBaseUrl()}/notifications/unsubscribe`;
}
export function unsubscribeUrl(token: string): string {
  return `${appBaseUrl()}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
}
export function verificationUrl(token: string): string {
  return `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}
export function resetPasswordUrl(token: string): string {
  return `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}
export function inviteUrl(token: string): string {
  return `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}&invite=1`;
}

export function newToken(): string { return randomBytes(32).toString('hex'); }
export function hashToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

export function isSmtpConfigured(): boolean {
  const host = (process.env.SMTP_HOST || '').trim();
  const from = (process.env.SMTP_FROM || '').trim();
  return !!host && !!from && !/example\.com/i.test(from);
}

function smtpFrom(): string { return (process.env.SMTP_FROM || '').trim(); }

function smtpTransport() {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const ignoreTLS = process.env.SMTP_IGNORE_TLS === 'true' || (!process.env.SMTP_USER && /^(127\.0\.0\.1|localhost)$/i.test(process.env.SMTP_HOST || ''));
  const requireTLS = process.env.SMTP_REQUIRE_TLS !== 'false' && !ignoreTLS && !secure;
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASSWORD || '').trim();
  return nodemailer.createTransport({
    host: (process.env.SMTP_HOST || '').trim(),
    port,
    secure,
    ignoreTLS,
    requireTLS,
    auth: user ? { user, pass } : undefined,
    pool: true,
    maxConnections: 3,
    maxMessages: 20,
    tls: { rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false' },
  });
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || 'Email delivery failed');
  return message.replace(/[\r\n]+/g, ' ').slice(0, 300);
}

async function sendViaSmtp(row: any): Promise<void> {
  if (!isSmtpConfigured()) throw new Error('Email delivery is not configured.');
  const transport = smtpTransport();
  const headers: Record<string, string> = {
    'X-MYLA-Template': String(row.template_key || 'message'),
  };
  if (row.payload?.unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${String(row.payload.unsubscribeUrl)}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  await transport.sendMail({
    from: smtpFrom(),
    to: row.recipient_email,
    subject: row.subject,
    html: row.html,
    text: row.text_body,
    headers,
  });
  transport.close();
}

/** Insert once, then try an immediate delivery. Never breaks the caller. */
export async function enqueueEmail(input: QueueEmailInput): Promise<EnqueueResult | null> {
  try {
    const admin = supabaseAdmin();
    const existing = await admin.from('email_outbox').select('id,status').eq('dedupe_key', input.dedupeKey).maybeSingle();
    if (existing.data) return { id: existing.data.id, queued: false, delivered: existing.data.status === 'sent' };
    const payload = { ...(input.payload || {}), unsubscribeUrl: input.unsubscribeUrl || null, category: input.templateKey };
    const inserted = await admin.from('email_outbox').insert({
      recipient_email: input.to.trim().toLowerCase(),
      recipient_user_id: input.userId || null,
      template_key: input.templateKey,
      subject: input.subject,
      html: input.html,
      text_body: input.text,
      payload,
      dedupe_key: input.dedupeKey,
      status: 'pending',
      scheduled_at: input.scheduledAt || new Date().toISOString(),
    }).select('id').single();
    if (inserted.error || !inserted.data) return null;
    const id = inserted.data.id as string;
    const delivered = isSmtpConfigured() ? await deliverEmailById(id) : false;
    return { id, queued: true, delivered };
  } catch { return null; }
}

export async function queueTemplateEmail(input: {
  to: string;
  userId?: string | null;
  templateKey: EmailTemplateKey;
  data: EmailTemplateData;
  dedupeKey: string;
  unsubscribeUrl?: string | null;
  payload?: Record<string, unknown>;
  scheduledAt?: string;
}): Promise<EnqueueResult | null> {
  const rendered = renderEmailTemplate(input.templateKey, {
    ...input.data,
    unsubscribeUrl: input.unsubscribeUrl || null,
  });
  return enqueueEmail({
    to: input.to,
    userId: input.userId,
    templateKey: input.templateKey,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    payload: input.payload,
    dedupeKey: input.dedupeKey,
    unsubscribeUrl: input.unsubscribeUrl,
    scheduledAt: input.scheduledAt,
  });
}

export async function deliverEmailById(id: string): Promise<boolean> {
  try {
    const admin = supabaseAdmin();
    const row = await admin.from('email_outbox').select('*').eq('id', id).maybeSingle();
    if (!row.data || row.data.status !== 'pending') return false;
    await sendViaSmtp(row.data);
    await admin.from('email_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
      .eq('id', id);
    return true;
  } catch (error) {
    try {
      const admin = supabaseAdmin();
      const current = await admin.from('email_outbox').select('attempts').eq('id', id).maybeSingle();
      const attempts = Number(current.data?.attempts || 0) + 1;
      const backoffMs = Math.min(24 * 60 * 60 * 1000, 5 * 60 * 1000 * Math.pow(2, Math.max(0, attempts - 1)));
      await admin.from('email_outbox').update({
        attempts,
        last_error: safeError(error),
        status: attempts >= 5 ? 'failed' : 'pending',
        scheduled_at: new Date(Date.now() + backoffMs).toISOString(),
      }).eq('id', id);
    } catch { /* delivery state must never break the caller */ }
    return false;
  }
}

export async function deliverPendingEmails(limit = 25): Promise<{ configured: boolean; sent: number; attempted: number; remaining: number }> {
  if (!isSmtpConfigured()) return { configured: false, sent: 0, attempted: 0, remaining: 0 };
  const admin = supabaseAdmin();
  const pending = await admin.from('email_outbox').select('id')
    .eq('status', 'pending').lte('scheduled_at', new Date().toISOString()).lt('attempts', 5)
    .order('created_at', { ascending: true }).limit(limit);
  let sent = 0;
  for (const row of pending.data || []) if (await deliverEmailById(row.id)) sent++;
  const remaining = await admin.from('email_outbox').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  return { configured: true, sent, attempted: (pending.data || []).length, remaining: remaining.count || 0 };
}

export function emailTemplateData(partial: Omit<EmailTemplateData, 'appUrl' | 'preferencesUrl' | 'unsubscribeUrl'> & { appUrl?: string; preferencesUrl?: string; orgSlug?: string | null }): EmailTemplateData {
  return {
    ...partial,
    appUrl: partial.appUrl || appBaseUrl(),
    preferencesUrl: partial.preferencesUrl || preferencesUrl(partial.orgSlug),
    unsubscribeUrl: null,
  };
}
