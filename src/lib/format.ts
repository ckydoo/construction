export function money(v: unknown, currency = 'USD', compact = false): string {
  const n = Number(v || 0);
  if (!isFinite(n)) return '—';
  if (compact && Math.abs(n) >= 1_000_000) return `${currency === 'USD' ? '$' : currency + ' '}${(n/1_000_000).toFixed(1)}M`;
  if (compact && Math.abs(n) >= 1_000) return `${currency === 'USD' ? '$' : currency + ' '}${(n/1_000).toFixed(1)}k`;
  try { return new Intl.NumberFormat('en-ZW', { style:'currency', currency, maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n); }
  catch { return `${currency} ${n.toLocaleString()}`; }
}
export function num(v: unknown, digits = 0): string {
  const n = Number(v || 0); return isFinite(n) ? n.toLocaleString('en-ZW',{maximumFractionDigits:digits}) : '—';
}
export function date(v: unknown): string {
  if (!v) return '—';
  const d = new Date(String(v)); if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
}
export function dateShort(v: unknown): string {
  if (!v) return '—';
  const d = new Date(String(v)); if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
}
export function ago(v: unknown): string {
  if (!v) return '';
  const diff = Date.now() - new Date(String(v)).getTime();
  const m = Math.floor(diff/60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h/24); if (d < 30) return `${d}d ago`;
  return date(v);
}
export function initials(name?: string): string {
  return (name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
}
export function pct(v: unknown): string { return `${Number(v||0).toFixed(0)}%`; }
export function csvCell(v: unknown): string {
  const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}
