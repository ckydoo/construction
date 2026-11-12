import type { Field, ResourceDef } from './resources';
import { normaliseLines } from './financial';

/** Generic validation uses the existing field contract, not invented business
 * requirements. Workflow-specific requirements belong in record invariants. */
export function validateFields(def: Pick<ResourceDef, 'fields'>, input: Record<string, unknown>): {ok:boolean; errors:Record<string,string>; clean:Record<string,any>} {
  const errors:Record<string,string> = {};
  const clean:Record<string,any> = {};
  for (const f of def.fields) {
    const raw = input[f.key];
    if (f.readOnly) { clean[f.key] = raw ?? null; continue; }
    const empty = raw == null || (typeof raw === 'string' && !raw.trim()) || (Array.isArray(raw) && raw.length === 0);
    if (empty) {
      clean[f.key] = f.type === 'tags' || f.type === 'items' ? [] : null;
      if (f.required) errors[f.key] = `${f.label} is required`;
      continue;
    }
    if (['number','currency','percent'].includes(f.type)) {
      const n = (typeof raw === 'number' || typeof raw === 'string') ? Number(raw) : NaN;
      clean[f.key] = Number.isFinite(n) ? n : null;
      if (!Number.isFinite(n)) errors[f.key] = 'Enter a valid number';
    } else if (f.type === 'boolean') {
      if (raw === true || raw === false) clean[f.key] = raw;
      else if (raw === 'true' || raw === 'false') clean[f.key] = raw === 'true';
      else { clean[f.key] = null; errors[f.key] = 'Choose yes or no'; }
    } else if (f.type === 'tags') {
      if (Array.isArray(raw) && raw.every(v => typeof v === 'string')) clean[f.key] = raw.map(v => v.trim()).filter(Boolean);
      else if (typeof raw === 'string') clean[f.key] = raw.split(',').map(v => v.trim()).filter(Boolean);
      else { clean[f.key] = []; errors[f.key] = 'Enter valid tags'; }
      if (f.required && !clean[f.key].length) errors[f.key] = `${f.label} is required`;
    } else if (f.type === 'items') {
      if (!Array.isArray(raw) && typeof raw !== 'string') { clean[f.key] = []; errors[f.key] = 'Enter valid item lines'; }
      else {
        clean[f.key] = normaliseLines(raw);
        if (Array.isArray(raw)) {
          if (raw.length > 80) errors[f.key] = 'Use no more than 80 item lines.';
          for (const [index, line] of raw.entries()) {
            if (!line || typeof line !== 'object' || Array.isArray(line)) { errors[f.key] = `Line ${index + 1}: enter a valid item.`; break; }
            const item = line as Record<string,unknown>;
            const description = item.description ?? item.name ?? item.item ?? item.title;
            const qty = item.qty ?? item.quantity ?? 1;
            const price = item.unitPrice ?? item.rate ?? item.price ?? 0;
            const numeric = (v: unknown) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v));
            if (typeof description !== 'string' || !description.trim()) { errors[f.key] = `Line ${index + 1}: enter a description.`; break; }
            if (!numeric(qty) || Number(qty) < 0 || !numeric(price) || Number(price) < 0) { errors[f.key] = `Line ${index + 1}: enter a non-negative quantity and unit price.`; break; }
            const calculated = Math.round(Number(qty) * Number(price) * 100) / 100;
            const total = item.total ?? item.amount;
            if (!Number.isFinite(calculated) || (total != null && (!numeric(total) || Math.abs(Number(total) - calculated) > 0.005))) { errors[f.key] = `Line ${index + 1}: the amount must match quantity multiplied by unit price.`; break; }
          }
        }
      }
      if (f.required && !clean[f.key].length) errors[f.key] = `${f.label} is required`;
    } else if (typeof raw !== 'string') {
      clean[f.key] = null; errors[f.key] = `Enter a valid ${f.label.toLowerCase()}`;
    } else {
      const value = raw.trim(); clean[f.key] = value;
      if (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) errors[f.key] = 'Enter a valid email';
      if (f.options && !f.options.includes(value)) errors[f.key] = 'Choose a valid option';
      if (f.type === 'date') {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(NaN);
        if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0,10) !== value) errors[f.key] = 'Enter a valid date';
      }
      if (f.type === 'datetime' && Number.isNaN(Date.parse(value))) errors[f.key] = 'Enter a valid date and time';
    }
  }
  return {ok: Object.keys(errors).length === 0, errors, clean};
}
