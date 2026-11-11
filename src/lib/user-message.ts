/**
 * One boundary for user-visible error text.
 *
 * Raw API/database/payment diagnostics stay available to developers in API
 * responses, QA scripts and engineering docs. Anything shown in a toast, inline
 * alert or form must pass through this helper so users see plain language.
 */
export const DEFAULT_USER_ERROR = 'Something went wrong. Please try again.';

const TECHNICAL_PATTERNS = [
  /\b(?:supabase|postgres|postgrest|pgrst|sql|rls|policy|policies|schema|relation|column|table|trigger|constraint|uuid|jwt|session|token|webhook|callback|hash|poll|idempotent|verifytoken|cron|environment|\.env|next_public_|supabase_|billing_|paynow_|dpo_|stripe_|cron_secret|api|fetch|network|request|status|http|internal server|stack|typeerror|referenceerror|syntaxerror|json|parse|payload|headers|body|code|error_code|pgrst\d+|42\d{3}|econn|etimedout|enotfound|socket|tls|ssl)\b/i,
  /\b(?:shadow mode|gateway|fallback|primary rail|tokenisation|tokenized|recurring|payout|merchant approval|callback secret|push secret|integration id|service type|company token|environment keys|vat\/tax decision|zimbabwe payout|grandfathered|comped|rolled back|read-only grace|mock is off|misconfigured|unknown action|unknown module|unknown resource|invalid request|not found|unauthorized|forbidden)\b/i,
  /\b[A-Z][A-Z0-9_]{5,}\b/,
  /https?:\/\//i,
  /[{}[\]<>]/,
  /`|npm |npx |supabase db push/i,
];

const SAFE_MESSAGE_START = /^(?:A|An|The|Enter|Please|Choose|Add|Write|Give|Use|Cancel|Only|Your|This|That|No\b|Incorrect|Nothing|Pay\b|Workspace|Prices|We couldn't|We couldn’t|Could not|Couldn't|Couldn’t|Something|A few|Logo|File|Parent|Record|Ticket|Assignee|Current period|Billing|Payment|Free trial|Portal|Documents|Owners|Member|Include|Open|Refresh|Use)/i;

type MessageLike = string | { message?: unknown; status?: unknown; technicalMessage?: unknown } | null | undefined;

function readMessage(error: MessageLike): { text: string; status?: number } {
  if (typeof error === 'string') return { text: error.trim() };
  if (!error || typeof error !== 'object') return { text: '' };
  const raw = typeof error.message === 'string' ? error.message : '';
  const status = typeof error.status === 'number' ? error.status : Number(error.status) || undefined;
  return { text: raw.trim(), status };
}

function looksTechnical(text: string): boolean {
  return TECHNICAL_PATTERNS.some(pattern => pattern.test(text));
}

function statusMessage(status?: number, fallback = DEFAULT_USER_ERROR): string {
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (status === 402) return 'Your workspace needs payment attention before this can continue.';
  if (status === 403) return 'You don’t have permission to do that.';
  if (status === 404) return 'We couldn’t find that item. Refresh and try again.';
  if (status === 409) return 'That change is no longer available. Refresh and try again.';
  return fallback;
}

export function userMessage(error: MessageLike, fallback = DEFAULT_USER_ERROR): string {
  const { text, status } = readMessage(error);
  if (!text) return statusMessage(status, fallback);
  if (looksTechnical(text)) return fallback !== DEFAULT_USER_ERROR ? fallback : statusMessage(status, fallback);
  if (SAFE_MESSAGE_START.test(text) && text.length <= 180) return text;
  return fallback !== DEFAULT_USER_ERROR ? fallback : statusMessage(status, fallback);
}
