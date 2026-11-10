'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Lucide from '@/components/lucide';
import { apiGet, apiSend, orgApi } from '@/lib/client';
import { COMPANY_TYPES, COMPANY_SIZES, QUALIFIERS, ROLES, ROLE_RULES, STARTER_MODULE_IDS, canRead, canWrite, canDelete, canCapability } from '@/lib/catalog';
import { Card, CardHead, Button, Icon, Badge, Field, Tabs, Toggle, Skeleton, ConfirmDialog, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Providers';
import { date, num } from '@/lib/format';

const CAP_LABELS:Record<string,string> = {
  'records.create':'Add records','records.update':'Edit records','records.delete':'Delete records',
  'files.upload':'Attach files','files.delete':'Remove files','comments.create':'Add comments',
  'exports':'Download CSV','settings.view':'See settings','settings.manage':'Change settings',
  'users.manage':'Manage people','project360':'See the whole job','integrity':'Check links',
  'wallet.read':'See client money','wallet.topup':'Add client money','wallet.allocate':'Put money on a job','wallet.refund':'Refund client money',
};
const TABS=[{id:'general',label:'General'},{id:'modules',label:'Sections'},{id:'users',label:'Users & roles'},{id:'setup',label:'Company profile'},{id:'data',label:'Data tools'},{id:'system',label:'Plan & audit'}];

export default function SettingsPage(){
  const {org}=useParams<{org:string}>(); const qc=useQueryClient(); const toast=useToast();
  const [tab,setTab]=useState('general');
  const {data:meta,isLoading}:any=useQuery({queryKey:['meta',org],queryFn:()=>apiGet(orgApi(org,'meta'))});
  const [form,setForm]=useState<any>({}); const [saving,setSaving]=useState(false);
  const [invite,setInvite]=useState<any>({name:'',email:'',role:'VIEWER',entityId:''});
  const [type,setType]=useState(''), [size,setSize]=useState(''), [quals,setQuals]=useState<string[]>([]);
  const [confirm,setConfirm]=useState<null|{title:string;desc:string;action:string;body?:any;method?:'PATCH'|'POST'}>(null);
  const [busy,setBusy]=useState(false); const [msg,setMsg]=useState('');
  const [csv,setCsv]=useState(''); const [csvResource,setCsvResource]=useState('clients');
  useEffect(()=>{ if(meta){setForm({name:meta.org.name,legalName:meta.org.legalName||'',regNumber:meta.org.regNumber||'',country:meta.org.country,baseCurrency:meta.org.baseCurrency,headcount:meta.org.headcount||''});setType(meta.org.companyType||'GENERAL_CONTRACTOR');setSize(meta.org.size||'SMALL');} },[meta]);
  const grouped=useMemo(()=>{const g:Record<string,any[]>={};for(const m of meta?.modules||[])(g[m.group]||=[]).push(m);return g;},[meta]);
  const caps:string[]=meta?.permissions?.capabilities||[];
  const {data:integrity,isFetching:integrityLoading}:any=useQuery({queryKey:['integrity',org],queryFn:()=>apiGet(orgApi(org,'integrity')),enabled:tab==='system'&&caps.includes('integrity')});
  const enabled=new Set(meta?.config?.modules||[]);

  async function send(action:string,body:any={},method:'PATCH'|'POST'='PATCH'){
    setBusy(true);setMsg('');
    try{const r=await apiSend(orgApi(org,'settings'),method,{action,...body});await qc.invalidateQueries({queryKey:['meta',org]});await qc.invalidateQueries({queryKey:['overview',org]});
      toast.push({tone:'success',title:'Settings updated',description:r.message||'Your changes have been saved.'});return r;
    }catch(e:any){toast.push({tone:'error',title:'Could not save',description:e.message});}finally{setBusy(false);setConfirm(null);} }
  async function saveGeneral(e:React.FormEvent){e.preventDefault();setSaving(true);
    try{await apiSend(orgApi(org,'settings'),'PATCH',{action:'updateOrg',...form});await qc.invalidateQueries({queryKey:['meta',org]});toast.push({tone:'success',title:'Company details saved'});}
    catch(e:any){toast.push({tone:'error',title:'Save failed',description:e.message});}finally{setSaving(false);} }
  function parseCsv(text:string){
    const lines=text.trim().split(/\r?\n/).filter(Boolean); if(lines.length<2)return[];
    const heads=lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,''));
    return lines.slice(1).map(l=>{const cells=l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map(c=>c.replace(/,$/,'').replace(/^"|"$/g,'').replace(/""/g,'"'))||l.split(',');
      return Object.fromEntries(heads.map((h,i)=>[h,cells[i]??'']));});
  }
  if(isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-1/3"/><Skeleton className="h-96"/></div>;
  if(!caps.includes('settings.view')) return <Card><EmptyState icon="ShieldCheck" title="Settings are restricted" description={`Your role (${ROLES.find(r=>r.id===meta?.role)?.label || (meta?.role||'').replace(/_/g,' ')}) can use the everyday sections but cannot change settings. Ask an owner or administrator if you need a different role.`}/></Card>;
  return <div className="space-y-4">
    <div><h1 className="heading">Settings</h1><p className="caption mt-1">Company details, which sections are on, who can use them, and your data.</p></div>
    <Tabs tabs={TABS} active={tab} onChange={setTab}/>

    {tab==='general'&&<Card><CardHead title="Company details" subtitle="Used on invoices, reports and documents"/>
      <form onSubmit={saveGeneral} className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label="Trading name" required><input className="input" value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})}/></Field>
        <Field label="Legal name"><input className="input" value={form.legalName||''} onChange={e=>setForm({...form,legalName:e.target.value})}/></Field>
        <Field label="Registration number"><input className="input" value={form.regNumber||''} onChange={e=>setForm({...form,regNumber:e.target.value})}/></Field>
        <Field label="Country"><input className="input" value={form.country||''} onChange={e=>setForm({...form,country:e.target.value})}/></Field>
        <Field label="Base currency"><select className="select" value={form.baseCurrency||'USD'} onChange={e=>setForm({...form,baseCurrency:e.target.value})}>{['USD','ZWG','ZAR','EUR','GBP'].map(c=><option key={c}>{c}</option>)}</select></Field>
        <Field label="Headcount"><input className="input" type="number" value={form.headcount||''} onChange={e=>setForm({...form,headcount:e.target.value})}/></Field>
        <div className="sm:col-span-2"><Button type="submit" variant="primary" loading={saving} icon="Save">Save changes</Button></div>
      </form></Card>}

    {tab==='modules'&&<div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold">Sections on your sidebar</p><p className="mt-0.5 text-xs muted">{enabled.size} of {meta.modules.length} sections on · changes show on the sidebar straight away.</p></div><Badge tone="green">{meta.config.plan} plan</Badge></Card>
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold">Start small or open everything</p><p className="mt-0.5 max-w-2xl text-xs muted">A very small company can start with just clients, quotes, jobs and money. Switch the rest on whenever you need it. The switches below still work either way.</p></div>
        <div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" icon="Minimize2" loading={busy} onClick={()=>send('applyPack',{pack:'essentials'})}>{`Essentials (${STARTER_MODULE_IDS.length})`}</Button><Button variant="primary" size="sm" icon="Layers" loading={busy} onClick={()=>send('applyPack',{pack:'full'})}>Everything on</Button></div></Card>
      {Object.entries(grouped).map(([group,mods]:any)=><Card key={group}><CardHead title={group} subtitle={`${mods.filter((m:any)=>enabled.has(m.id)).length} of ${mods.length} enabled`}/>
        <div className="grid gap-px bg-slate-100 dark:bg-ink-800 sm:grid-cols-2">{mods.map((m:any)=><div key={m.id} className="flex items-start gap-3 bg-white p-4 dark:bg-ink-900">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border divider text-ink-500 dark:bg-ink-800 dark:text-slate-300"><Icon name={m.icon} size={16}/></span>
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-ink-900 dark:text-white">{m.label}</p><p className="mt-0.5 text-[11px] leading-relaxed muted">{m.description}</p><div className="mt-1.5 flex gap-1"><Badge tone={m.tier==='CORE'?'slate':m.tier==='ENTERPRISE'?'violet':'blue'}>{m.tier.toLowerCase()}</Badge>{m.resources?.length>0&&<Badge tone="slate">{m.resources.length} resources</Badge>}</div></div>
          <Toggle checked={enabled.has(m.id)} onChange={v=>send('toggleModule',{moduleId:m.id,enabled:v})}/></div>)}</div></Card>)}
    </div>}

    {tab==='users'&&<div className="space-y-4"><Card><CardHead title="Invite a teammate" subtitle="New users receive the temporary password Welcome@123"/>
      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label="Full name"><input className="input" value={invite.name} onChange={e=>setInvite({...invite,name:e.target.value})} placeholder="Jane Moyo"/></Field>
        <Field label="Work email"><input className="input" type="email" value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})} placeholder="jane@company.co.zw"/></Field>
        <Field label="Role"><select className="select" value={invite.role} onChange={e=>setInvite({...invite,role:e.target.value})}>{ROLES.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></Field>
        <Button variant="primary" loading={busy} icon="UserPlus" onClick={()=>send('invite',invite,'POST').then(()=>setInvite({name:'',email:'',role:'VIEWER',entityId:''}))}>Add user</Button>
      </div>
      {invite.role.endsWith('_EXTERNAL')&&<div className="border-t divider px-4 py-3"><Field label="Link to client (portal scope)" hint="Portal users only see this client's records, projects and wallet."><select className="select" value={invite.entityId} onChange={e=>setInvite({...invite,entityId:e.target.value})}><option value="">Select a client…</option>{(meta.clients||[]).map((c:any)=><option key={c.id} value={c.id}>{c.label}</option>)}</select></Field></div>}
      </Card>
      <Card className="overflow-hidden"><CardHead title="Team members" subtitle={`${meta.users.length} users in this workspace`}/>
        <div className="divide-y divider">{meta.users.map((u:any)=><div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md text-xs font-semibold text-white" style={{background:u.avatarColor}}>{u.name.split(' ').map((w:string)=>w[0]).slice(0,2).join('')}</span>
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">{u.name}</p><p className="truncate text-[11px] muted">{u.email}</p></div>
          <select className="select w-auto min-w-[190px]" value={u.role} disabled={!caps.includes('users.manage')||u.id===meta.user.id}
            onChange={e=>send('setRole',{userId:u.id,role:e.target.value})}>{ROLES.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select>
          {u.role.endsWith('_EXTERNAL')&&<select className="select w-auto min-w-[160px]" value={u.entityId||''} disabled={!caps.includes('users.manage')}
            onChange={e=>send('setScope',{userId:u.id,entityId:e.target.value||null})}><option value="">Whole company</option>{(meta.clients||[]).map((c:any)=><option key={c.id} value={c.id}>{c.label}</option>)}</select>}
          {caps.includes('users.manage')&&u.role!=='OWNER'&&u.id!==meta.user.id&&<Button variant="ghost" size="sm" className="text-red-600" icon="Trash2" onClick={()=>setConfirm({title:`Remove ${u.name}?`,desc:'Their workspace access and sessions will be revoked.',action:'removeUser',body:{userId:u.id},method:'PATCH'})}>Remove</Button>}
          <span className="hidden text-[11px] muted sm:block">Joined {date(u.joined)}</span></div>)}</div></Card>
      <Card className="overflow-hidden"><CardHead title="Role permissions" subtitle="Checked every time someone saves — a change takes effect immediately"/>
        <div className="overflow-x-auto"><table className="w-full text-left text-[13px]"><thead className="border-y divider bg-slate-50 muted dark:bg-ink-950/50"><tr><th className="table-th">Role</th><th className="table-th text-right">Read</th><th className="table-th text-right">Write</th><th className="table-th">Delete</th><th className="table-th">Wallets</th><th className="table-th">Scope</th></tr></thead>
          <tbody className="divide-y divider">{ROLES.map(r=>{const rule=ROLE_RULES[r.id]; const reads=(meta.config.resources||[]).filter((x:string)=>canRead(r.id,x)).length; const writes=(meta.config.resources||[]).filter((x:string)=>canWrite(r.id,x)).length;
            const w=(rule.capabilities as string[]).filter((c:string)=>c.startsWith('wallet.')).map((c:string)=>c.split('.')[1]).join(', ')||'none';
            return <tr key={r.id} className={r.id===meta.role?'bg-slate-50 dark:bg-ink-950/50':''}><td className="table-td"><p className="font-medium">{r.label}</p><p className="text-[10px] muted">{r.desc}</p></td>
              <td className="table-td text-right"><Badge tone={reads?'slate':'red'}>{reads} / {meta.config.resources.length}</Badge></td>
              <td className="table-td text-right"><Badge tone={writes?'blue':'slate'}>{writes}</Badge></td>
              <td className="table-td">{canDelete(r.id)?<Badge tone="amber">Yes</Badge>:<Badge tone="slate">No</Badge>}</td>
              <td className="table-td"><span className="text-[11px] muted">{w}</span></td>
              <td className="table-td">{rule.scoped?<Badge tone="violet">Own jobs only</Badge>:<Badge tone="green">Whole company</Badge>}</td></tr>;})}</tbody></table></div></Card>
      <Card><CardHead title="Your access" subtitle={`Signed in as ${meta.role.replace(/_/g,' ')}`}/><div className="flex flex-wrap gap-1.5 p-5">{caps.map(c=><Badge key={c} tone="blue">{CAP_LABELS[c]||c}</Badge>)}</div></Card></div>}

    {tab==='setup'&&<div className="space-y-4"><Card><CardHead title="Recalculate your sections" subtitle="Changing your type or size works out which sections appear again"/>
      <div className="space-y-5 p-5"><div><p className="label">Company type</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{COMPANY_TYPES.map(t=><button key={t.id} onClick={()=>setType(t.id)} className={`flex items-center gap-2 rounded-lg border p-2.5 text-left text-xs transition ${type===t.id?'border-brand-400 bg-brand-50 dark:bg-brand-500/10':'divider'}`}><Icon name={t.icon} size={15}/>{t.label}</button>)}</div></div>
      <div><p className="label">Company size</p><div className="flex flex-wrap gap-2">{COMPANY_SIZES.map(s=><button key={s.id} onClick={()=>setSize(s.id)} className={`rounded-lg border px-3 py-2 text-xs transition ${size===s.id?'border-brand-400 bg-brand-50 dark:bg-brand-500/10':'divider'}`}><span className="font-semibold">{s.label}</span><span className="ml-1.5 muted">{s.range}</span></button>)}</div></div>
      <div><p className="label">How you work</p><div className="flex flex-wrap gap-2">{QUALIFIERS.map(q=><button key={q.id} onClick={()=>setQuals(v=>v.includes(q.id)?v.filter(x=>x!==q.id):[...v,q.id])} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition ${quals.includes(q.id)?'border-brand-400 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-300':'divider muted'}`}>{quals.includes(q.id)?<Lucide.Check size={12}/>:<Lucide.Plus size={12}/>}{q.label}</button>)}</div></div>
      <Button variant="primary" loading={busy} icon="RefreshCw" onClick={()=>send('reconfigure',{companyType:type,size,qualifiers:quals},'POST')}>Update my sections</Button></div></Card></div>}

    {tab==='data'&&<div className="space-y-4">
      <Card><CardHead title="Sample data" subtitle="616 sample records — jobs, staff, orders, tax invoices, time sheets, site queries, safety and more"/>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5"><p className="max-w-lg text-xs muted">This replaces all existing business records in this workspace with the demo dataset. Perfect for evaluating every screen with live, reconciled data.</p>
          <Button variant="primary" icon="Database" loading={busy} onClick={()=>setConfirm({title:'Replace data with demo dataset?',desc:'All existing records in this workspace will be deleted and replaced with 616 demo records.',action:'seedDemo'})}>Load demo data</Button></div></Card>
      <Card><CardHead title="Import CSV" subtitle="Paste a CSV with a header row (for example name,status,amount)"/>
        <div className="grid gap-4 p-5 sm:grid-cols-[220px_1fr]"><Field label="Target resource"><select className="select" value={csvResource} onChange={e=>setCsvResource(e.target.value)}>{meta.resources.filter((r:any)=>meta.config.resources.includes(r.id)).map((r:any)=><option key={r.id} value={r.id}>{r.label}</option>)}</select></Field>
          <Field label="CSV data"><textarea className="input min-h-[100px] font-mono text-xs" value={csv} onChange={e=>setCsv(e.target.value)} placeholder={'name,type,city,status\nNew Client,Private developer,Harare,ACTIVE'}/></Field>
          <div className="sm:col-span-2"><Button variant="primary" icon="Upload" loading={busy} onClick={()=>{const rows=parseCsv(csv);if(!rows.length){toast.push({tone:'error',title:'No rows found',description:'Include a header row and at least one data row.'});return;}send('importCsv',{resource:csvResource,rows},'POST');}}>Import rows</Button></div></div></Card>
      <Card><CardHead title="Export & clear" subtitle="Download any dataset or wipe business records"/>
        <div className="flex flex-wrap items-center gap-3 p-5"><select className="select w-auto min-w-[200px]" value={csvResource} onChange={e=>setCsvResource(e.target.value)}>{meta.resources.filter((r:any)=>meta.config.resources.includes(r.id)).map((r:any)=><option key={r.id} value={r.id}>{r.label}</option>)}</select>
          <a href={orgApi(org,`records/${csvResource}?mode=csv`)} download><Button icon="Download">Export CSV</Button></a>
          <Button variant="ghost" className="text-red-600" icon="Trash2" onClick={()=>setConfirm({title:'Clear all business records?',desc:'Every record in this workspace will be deleted. Users, settings and modules are kept.',action:'clearData'})}>Clear all records</Button></div></Card></div>}

    {tab==='system'&&<div className="space-y-4">
      {caps.includes('integrity')&&<Card><CardHead title="Link integrity" subtitle="Every cross-module reference, wallet balance and derived project figure" action={<Button size="sm" icon="RefreshCw" loading={integrityLoading} onClick={()=>qc.invalidateQueries({queryKey:['integrity',org]})}>Re-run</Button>}/>
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {[['Cross-module refs',num(integrity?.checkedRefs),integrity?.brokenRefCount===0?'All resolve':'Broken links'],['Wallet ledger',num(integrity?.ledgerEntries),integrity?.walletMismatches?.length===0?'Reconciled':'Mismatch'],['Project funding',num(integrity?.fundingMismatches?.length),integrity?.fundingMismatches?.length===0?'Reconciled':'Mismatch'],['Orphan wallet rows',num(integrity?.walletOrphanCount),integrity?.walletOrphanCount===0?'None':'Found']].map(([l,v,sub])=><div key={String(l)} className="rounded-lg border divider bg-slate-50/60 p-3 dark:bg-ink-950/40"><p className="text-[11px] muted">{l}</p><p className="mt-1 text-lg font-semibold tabular-nums">{v}</p><p className="text-[10px] muted">{sub}</p></div>)}
        </div>
        {integrity&&<div className="border-t divider px-5 py-3"><Badge tone={integrity.ok?'green':'red'}>{integrity.ok?'All links healthy':'Integrity issues found'}</Badge><span className="ml-2 text-[11px] muted">{integrity.checkedRecords} records · {integrity.wallets} wallets · checked {date(integrity.generatedAt)}</span></div>}</Card>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[['Plan',meta.config.plan],['Modules enabled',num(meta.config.modules.length)],['Resource types',num(meta.config.resources.length)],['User limit',num(meta.config.limits.users)],['Project limit',num(meta.config.limits.projects)],['Storage',`${num(meta.config.limits.storageMb/1000)} GB`],['Regional pack',meta.config.localePack],['Currency',meta.org.baseCurrency]].map(([l,v])=><Card key={String(l)} className="p-4"><p className="text-[11px] font-semibold uppercase tracking-wider muted">{l}</p><p className="mt-1.5 text-lg font-semibold">{v}</p></Card>)}</div>
      <Card><CardHead title="Extra options" subtitle="Based on your company size and your answers"/>
        <div className="flex flex-wrap gap-2 p-5">{Object.entries(meta.config.flags).map(([k,v])=><Badge key={k} tone={v?'green':'slate'}>{k.replace(/([A-Z])/g,' $1').trim()}</Badge>)}</div></Card>
      <Card className="overflow-hidden"><CardHead title="Audit log" subtitle="Most recent workspace actions"/>
        <div className="divide-y divider">{meta.audit.slice(0,12).map((a:any)=><div key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5"><span className="text-xs font-medium">{a.actor}</span><span className="min-w-0 flex-1 truncate text-xs muted">{a.detail}</span><Badge tone={a.action==='DELETE'?'red':'slate'}>{a.action}</Badge><span className="text-[11px] muted">{date(a.createdAt)}</span></div>)}</div></Card></div>}
    <ConfirmDialog open={!!confirm} onClose={()=>setConfirm(null)} loading={busy} title={confirm?.title||''} description={confirm?.desc}
      onConfirm={()=>{if(!confirm)return;send(confirm.action,confirm.body||{},confirm.method||'POST');}}/>
  </div>;
}
