import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs';import assert from 'node:assert/strict';
const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table records(id text primary key,organization_id uuid,resource text,status text,data jsonb);create table audit(action text);create function public.app_role(o uuid) returns text language sql as $$select coalesce(nullif(current_setting('test.role',true),''),'OWNER')$$;create function public.app_can_write(o uuid,r text) returns boolean language sql as $$select true$$;create function public.app_has_capability(o uuid,c text) returns boolean language sql as $$select true$$;create function public.app_visible_record_id(o uuid,r text) returns boolean language sql as $$select true$$;create function public.app_log_activity(o uuid,a text,ac text,r text,d text) returns void language sql as $$insert into audit values(ac)$$;`);
await db.exec(fs.readFileSync('supabase/migrations/20261116000000_approval_authority.sql','utf8'));
await db.exec(`select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);insert into records values('t','10000000-0000-4000-8000-000000000001','timesheets','SUBMITTED','{"status":"SUBMITTED","employeeId":"e","projectId":"p","weekStart":"2026-11-01","weekEnd":"2026-11-07","regularHours":40,"overtimeHours":8,"totalHours":1}');`);
let q=await db.query(`select data->>'totalHours' total from records where id='t'`);assert.equal(+q.rows[0].total,48);
await db.exec(`update records set status='APPROVED',data=jsonb_set(data,'{status}','"APPROVED"') where id='t'`);
q=await db.query(`select data->>'approvalActorId' actor,data->>'approvedAt' approved_at from records where id='t'`);assert.equal(q.rows[0].actor,'10000000-0000-4000-8000-000000000002');assert.ok(q.rows[0].approved_at);
await db.exec(`update records set data=jsonb_set(data,'{approvalActorId}','"spoof"') where id='t'`);assert.equal((await db.query(`select data->>'approvalActorId' a from records where id='t'`)).rows[0].a,'10000000-0000-4000-8000-000000000002');
await assert.rejects(()=>db.exec(`update records set data=jsonb_set(data,'{regularHours}','45') where id='t'`),/Return the approved record/);
await db.exec(`update records set status='DRAFT',data=jsonb_set(data,'{status}','"DRAFT"') where id='t'`);
assert.equal((await db.query(`select data->>'approvedAt' a from records where id='t'`)).rows[0].a,null);
await db.exec(`update records set data=jsonb_set(data,'{regularHours}','45') where id='t'`);
assert.equal(Number((await db.query(`select data->>'totalHours' h from records where id='t'`)).rows[0].h),53);
await assert.rejects(()=>db.exec(`insert into records values('bad','10000000-0000-4000-8000-000000000001','timesheets','APPROVED','{"status":"APPROVED"}')`),/Submit/);
await db.exec(`insert into records values('denied','10000000-0000-4000-8000-000000000001','timesheets','SUBMITTED','{"status":"SUBMITTED","employeeId":"e","projectId":"p","weekStart":"2026-11-01","weekEnd":"2026-11-07","regularHours":1}'); select set_config('test.role','HR_MANAGER',false);`);
await assert.rejects(()=>db.exec(`update records set status='APPROVED',data=jsonb_set(data,'{status}','"APPROVED"') where id='denied'`),/not authorized/);
assert.equal((await db.query(`select status from records where id='denied'`)).rows[0].status,'SUBMITTED');
await db.exec(`select set_config('test.role','OWNER',false)`);
await assert.rejects(()=>db.exec(`insert into records values('skip','10000000-0000-4000-8000-000000000001','timesheets','POSTED','{"status":"POSTED"}')`),/approved first/);
await db.exec(`insert into records values('v','10000000-0000-4000-8000-000000000001','changeOrders','SUBMITTED','{"status":"SUBMITTED"}');update records set status='APPROVED',data=jsonb_set(data,'{status}','"APPROVED"') where id='v';`);assert.ok((await db.query(`select data->>'decisionDate' d from records where id='v'`)).rows[0].d);
console.log('PASS isolated approval trigger: hours, actor, time, spoof protection, workflow and variation decision date (mocked authorization).');
}finally{await db.close()}
