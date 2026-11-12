// Reproduces the current non-atomic legacy path in an isolated database.
// This is a baseline, not a passing settlement test and not a production write.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
try {
  await db.exec('create table public.records (id uuid primary key, organization_id uuid, resource text, status text, data jsonb, deleted_at timestamptz)');
  await db.exec(fs.readFileSync('supabase/migrations/20261115000000_financial_record_invariants.sql', 'utf8'));
  const org='10000000-0000-4000-8000-000000000001', client='10000000-0000-4000-8000-000000000002', invoice='10000000-0000-4000-8000-000000000003', receipt='10000000-0000-4000-8000-000000000004';
  await db.query(`insert into records values ($1,$2,'clients','ACTIVE','{}',null)`, [client,org]);
  await db.query(`insert into records values ($1,$2,'arInvoices','ISSUED',$3::jsonb,null)`, [invoice,org,JSON.stringify({status:'ISSUED',clientId:client,invoiceDate:'2026-11-12',dueDate:'2026-12-12',total:34500})]);
  // Legacy conversion commits the receipt separately before the invoice update.
  await db.query(`insert into records values ($1,$2,'payments','CLEARED',$3::jsonb,null)`, [receipt,org,JSON.stringify({status:'CLEARED',direction:'RECEIPT',amount:34500,sourceId:invoice,sourceResource:'arInvoices'})]);
  await assert.rejects(() => db.query(`update records set status='PAID',data=data || '{"status":"PAID","amountPaid":34500}'::jsonb where id=$1`,[invoice]),/reconciliation/i);
  const { rows } = await db.query(`select resource,status,data->>'amountPaid' as paid from records where id in ($1,$2) order by resource`, [invoice,receipt]);
  assert.deepEqual(rows.map(r=>[r.resource,r.status,r.paid]),[['arInvoices','ISSUED',null],['payments','CLEARED',null]]);
  console.log('Baseline reproduced: receipt persisted while invoice settlement was rejected. Not a fix.');
} finally { await db.close(); }
