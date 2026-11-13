import { csvCell } from './format';
import type { Field } from './resources';

/** Export stored lines without inventing totals or losing unfamiliar fields. */
function storedLines(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try { const parsed: unknown = JSON.parse(value); if (Array.isArray(parsed)) return parsed; } catch { /* legacy text below */ }
  return value.split(/\r?\n/).filter(line => line.trim() !== '');
}

export function lineItemsCsv(rows: Record<string, any>[], fields: Field[]): string {
  const columns = ['Record ID','Record no.','Record title','Currency','Item field','Line no.','Description','Detail','Quantity','Unit price','Line total','Category','Stored line JSON'];
  const data: string[] = [columns.map(csvCell).join(',')];
  for (const row of rows) for (const field of fields.filter(f => f.type === 'items' && !f.hidden)) {
    storedLines(row[field.key]).forEach((raw, i) => {
      const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      const description = typeof raw === 'string' ? raw : item.description ?? item.name ?? item.item ?? item.title;
      const cells = [row.id, row.number, row.title ?? row.name, row.currency, field.key, i+1,
        description, item.detail ?? item.notes ?? item.note ?? item.specification,
        item.qty ?? item.quantity, item.unitPrice ?? item.rate ?? item.price,
        item.total ?? item.amount, item.category, JSON.stringify(raw)];
      data.push(cells.map(csvCell).join(','));
    });
  }
  return data.join('\r\n') + '\r\n';
}
