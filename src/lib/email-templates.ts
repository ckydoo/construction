/* Premium, self-contained email templates. No external CSS, fonts or images:
 * every message renders reliably in company mail clients and the in-app preview. */
export type EmailTemplateKey =
  | 'verification' | 'welcome' | 'reset_password' | 'password_changed'
  | 'billing' | 'invite' | 'digest' | 'support' | 'reminder';

export type EmailTemplateData = {
  appUrl: string;
  preferencesUrl: string;
  subject?: string;
  headline: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  note?: string;
  name?: string;
  details?: string[];
  essential?: boolean;
  unsubscribeUrl?: string | null;
};

const DEFAULT_SUBJECTS: Record<EmailTemplateKey, string> = {
  verification: 'Confirm your MYLA email address',
  welcome: 'Welcome to MYLA',
  reset_password: 'Reset your MYLA password',
  password_changed: 'Your MYLA password was changed',
  billing: 'Your MYLA subscription',
  invite: 'You have been invited to MYLA',
  digest: 'Your MYLA workspace summary',
  support: 'Your MYLA support update',
  reminder: 'A MYLA action needs attention',
};

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function defaultSubject(key: EmailTemplateKey): string { return DEFAULT_SUBJECTS[key]; }

export function renderEmailTemplate(key: EmailTemplateKey, data: EmailTemplateData) {
  const subject = data.subject || defaultSubject(key);
  const greeting = data.name ? `Hello ${esc(data.name)},` : 'Hello,';
  const essential = data.essential ?? ['verification', 'reset_password', 'password_changed', 'billing'].includes(key);
  const note = data.note || (essential
    ? 'This is an essential account message. Security and billing emails stay on even when optional notifications are muted.'
    : 'You can change what you receive at any time.');
  const details = (data.details || []).filter(Boolean);
  const cta = data.ctaLabel && data.ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px"><tr><td style="border-radius:8px;background:#d97706"><a href="${esc(data.ctaUrl)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px">${esc(data.ctaLabel)}</a></td></tr></table>`
    : '';
  const detailHtml = details.length
    ? `<ul style="margin:18px 0 0;padding-left:20px;color:#334155;font-size:14px;line-height:1.65">${details.map(d => `<li>${esc(d)}</li>`).join('')}</ul>`
    : '';
  const detailText = details.length ? `\n\n${details.map(d => `• ${d}`).join('\n')}` : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <span style="display:none!important;max-height:0;overflow:hidden;opacity:0">${esc(subject)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
    <tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
      <tr><td style="padding:24px 32px;border-bottom:1px solid #e2e8f0"><span style="font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#0f172a">MYLA</span><span style="margin-left:10px;font-size:11px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:#64748b">Construction workspace</span></td></tr>
      <tr><td style="padding:32px">
        <p style="margin:0 0 18px;font-size:14px;color:#475569">${greeting}</p>
        <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;letter-spacing:-0.4px;color:#0f172a">${esc(data.headline)}</h1>
        <p style="margin:0;font-size:14px;line-height:1.7;color:#334155">${esc(data.body)}</p>
        ${detailHtml}
        ${cta}
        <p style="margin:26px 0 0;font-size:12px;line-height:1.6;color:#64748b">${esc(note)}</p>
      </td></tr>
      <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;line-height:1.7;color:#64748b">
        ${data.unsubscribeUrl && !essential ? `<a href="${esc(data.unsubscribeUrl)}" style="color:#b45309;text-decoration:none;font-weight:600">Turn off optional emails</a> · ` : ''}<a href="${esc(data.preferencesUrl)}" style="color:#b45309;text-decoration:none;font-weight:600">Manage email preferences</a> · <a href="${esc(data.appUrl)}" style="color:#64748b;text-decoration:none">Open MYLA</a><br>
        MYLA · Harare, Zimbabwe. Please do not reply to this message.
      </td></tr>
    </table></td></tr>
  </table>
</body></html>`;
  const unsubscribeText = data.unsubscribeUrl && !essential ? `Turn off optional emails: ${data.unsubscribeUrl}\n` : '';
  const text = `${greeting}\n\n${data.headline}\n\n${data.body}${detailText}${data.ctaLabel && data.ctaUrl ? `\n\n${data.ctaLabel}: ${data.ctaUrl}` : ''}\n\n${note}\n\n${unsubscribeText}Manage email preferences: ${data.preferencesUrl}\nOpen MYLA: ${data.appUrl}\n\nMYLA · Harare, Zimbabwe. Please do not reply to this message.`;
  return { subject, html, text };
}
