import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const db=new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role; create table public.records (id text primary key, organization_id uuid not null, resource text, status text, data jsonb, deleted_at timestamptz, unique (organization_id,id));`);
 await db.exec(`create table public.organizations (id uuid primary key); create table public.memberships (organization_id uuid,user_id uuid,role text, unique(organization_id,user_id));
 create or replace function public.app_can_write(o uuid,r text) returns boolean language sql stable as $$ select exists(select 1 from memberships m where m.organization_id=o and m.user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid and m.role='OWNER') $$;
 create or replace function public.app_has_capability(o uuid,c text) returns boolean language sql stable as $$ select public.app_can_write(o,'payments') $$;
 create or replace function public.app_visible_record_id(o uuid,r text) returns boolean language sql stable as $$ select r<>'hidden' and exists(select 1 from records where organization_id=o and id=r) $$;`);
  await db.exec(fs.readFileSync('database-work/receipt-allocation-draft.sql','utf8'));
  const a='10000000-0000-4000-8000-000000000001', b='10000000-0000-4000-8000-000000000002', u='10000000-0000-4000-8000-000000000003', key='10000000-0000-4000-8000-000000000004';
  await db.query(`insert into records values ('receipt',$1,'payments',null,'{}',null),('invoice',$1,'arInvoices',null,'{}',null),('other-invoice',$2,'arInvoices',null,'{}',null)`,[a,b]);
  const {rows}=await db.query(`insert into receipt_allocation_batches (organization_id,receipt_id,request_id,payload,created_by) values ($1,'receipt',$2,'{}',$3) returning id`,[a,key,u]);
  const batch=rows[0].id;
  await assert.rejects(()=>db.query(`insert into receipt_allocation_batches (organization_id,receipt_id,request_id,payload,created_by) values ($1,'receipt',$2,'{}',$3)`,[a,key,u]),/unique/i);
  await assert.rejects(()=>db.query(`insert into receipt_allocation_lines (organization_id,batch_id,invoice_id,amount_minor) values ($1,$2,'invoice',0)`,[a,batch]),/check constraint/i);
  await assert.rejects(()=>db.query(`insert into receipt_allocation_lines (organization_id,batch_id,invoice_id,amount_minor) values ($1,$2,'other-invoice',100)`,[a,batch]),/foreign key/i);
  await db.query(`insert into receipt_allocation_lines (organization_id,batch_id,invoice_id,amount_minor) values ($1,$2,'invoice',100)`,[a,batch]);
  await assert.rejects(()=>db.query(`insert into receipt_allocation_lines (organization_id,batch_id,invoice_id,amount_minor) values ($1,$2,'invoice',1)`,[a,batch]),/unique/i);
  await assert.rejects(()=>db.exec(`set role authenticated; select * from public.receipt_allocation_lines`),/permission denied/i);
  console.log('Draft allocation schema: scope FKs, positive amounts, duplicate keys and denied direct access verified in isolated database. This schema-only test does not test settlement.');
} finally {await db.close();}
