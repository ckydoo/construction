import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`create table public.records (id uuid primary key, organization_id uuid, resource text, status text, data jsonb, deleted_at timestamptz);`);
await db.exec(fs.readFileSync('supabase/migrations/20261115000000_financial_record_invariants.sql','utf8'));
const org='10000000-0000-4000-8000-000000000001', client='10000000-0000-4000-8000-000000000002';
await db.query(`insert into records values ($1,$2,'clients','ACTIVE','{}',null)`,[client,org]);
async function put(resource,status,data) { return db.query(`insert into records values (gen_random_uuid(),$1,$2,$3,$4::jsonb,null)`,[org,resource,status,JSON.stringify(data)]); }
await assert.rejects(()=>put('journals','POSTED',{status:'POSTED',debit:100}), /posting is unavailable/i);
await assert.rejects(()=>put('arInvoices','ISSUED',{status:'ISSUED'}), /Client:/);
await assert.rejects(()=>put('arInvoices','ISSUED',{status:'ISSUED',clientId:client,invoiceDate:'2026-02-30',dueDate:'2026-03-05'}), /Invoice date:/);
await assert.rejects(()=>put('arInvoices','ISSUED',{status:'ISSUED',clientId:client,invoiceDate:'2026-03-06',dueDate:'2026-03-05'}), /Due date/);
await put('arInvoices','ISSUED',{status:'ISSUED',clientId:client,invoiceDate:'2026-03-01',dueDate:'2026-03-05'});
await assert.rejects(()=>put('arInvoices','PAID',{status:'PAID',clientId:client,invoiceDate:'2026-03-01',dueDate:'2026-03-05'}), /reconciliation/);
for (const resource of ['projects','tasks']) { await assert.rejects(()=>put(resource,'ACTIVE',{progress:150}),/between 0 and 100/); await put(resource,'ACTIVE',{progress:100}); }
console.log('Isolated PostgreSQL trigger checks passed'); await db.close();
