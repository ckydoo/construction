/* PostgREST caps a response (usually 1000 rows); page through everything.
 * Always uses the caller's cookie-bound client so RLS applies to every page. */
import { supabase, dbError } from './supabase';

export async function fetchAll(
  table: string,
  apply: (q: any) => any = (q) => q,
  columns = '*',
): Promise<any[]> {
  const sb = await supabase();
  const out: any[] = [];
  const size = 1000;
  for (let start = 0; start <= 50000; start += size) {
    const q = apply(sb.from(table).select(columns)).order('id', { ascending: true }).range(start, start + size - 1);
    const { data, error } = await q;
    if (error) dbError(error);
    const rows = data || [];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}
