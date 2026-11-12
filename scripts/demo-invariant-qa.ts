import { PGlite } from '@electric-sql/pglite';
import { buildDemo } from '../src/lib/demo';
import fs from 'node:fs';
async function main() {
const db = new PGlite();
await db.exec(`create table public.records (id text primary key, organization_id uuid, resource text, status text, data jsonb, deleted_at timestamptz);`);
await db.exec(fs.readFileSync('supabase/migrations/20261115000000_financial_record_invariants.sql','utf8'));
const org='10000000-0000-4000-8000-000000000001';
const demo=buildDemo(org);
for(const r of demo.records) await db.query(`insert into records values ($1,$2,$3,$4,$5::jsonb,null)`,[r.id,org,r.resource,r.status,JSON.stringify(r.data)]);
console.log(`Demo trigger checks passed for ${demo.records.length} records`);
await db.close();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
