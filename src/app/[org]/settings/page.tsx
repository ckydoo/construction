'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Lucide from '@/components/lucide';
import { apiGet, apiSend, orgApi } from '@/lib/client';
import { COMPANY_TYPES, COMPANY_SIZES, QUALIFIERS, ROLES } from '@/lib/catalog';
import { Card, CardHead, Button, Icon, Badge, Field, Tabs, Toggle, Skeleton, ConfirmDialog, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Providers';
import { date, num } from '@/lib/format';

const TABS=[{id:'general',label:'General'},{id:'modules',label:'Modules'},{id:'users',label:'Users & roles'},{id:'setup',label:'Company profile'},{id:'data',label:'Data tools'},{id:'system',label:'Plan & audit'}];

export default function SettingsPage(){
  const {org}=useParams<{org:string}>(); const qc=useQueryClient(); const toast=useToast();
  const [tab,setTab]=useState('general');
  const {data:meta,isLoading}:any=useQuery({queryKey:['meta',org],queryFn:()=>apiGet(orgApi(org,'meta'))});
  const [form,setForm]=useState<any>({}); const [saving,setSaving]=useState(false);
  const [invite,setInvite]=useState({name:'',email:'',role:'VIEWER'});
  const [type,setType]=useState(''), [size,setSize]=useState(''), [quals,setQuals]=useState<string[]>([]);
  const [confirm,setConfirm]=useState<null|{title:string;desc:string;action:string;body?:any}>(null);
  const [busy,setBusy]=useState(false); const [msg,setMsg]=useState('');
  const [csv,setCsv]=useState(''); const [csvResource,setCsvResource]=useState('clients');
  useEffect(()=>{ if(meta){setForm({name:meta.org.name,legalName:meta.org.legalName||'',regNumber:meta.org.regNumber||'',country:meta.org.country,baseCurrency:meta.org.baseCurrency,headcount:meta.org.headcount||''});setType(meta.org.companyType||'GENERAL_CONTRACTOR');setSize(meta.org.size||'SMALL');} },[meta]);
  const grouped=useMemo(()=>{const g:Record<string,any[]>={};for(const m of meta?.modules||[])(g[m.group]||=[]).push(m);return g;},[meta]);
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
  return <div className="space-y-5">
    <div><h1 className="heading">Workspace settings</h1><p className="mt-1 text-xs muted">Manage your company profile, enabled modules, team access and data.</p></div>
    <Tabs tabs={TABS} active={tab} onChange={setTab}/>

    {tab==='general'&&<Card><CardHead title="Company details" subtitle="Used on invoices, reports and documents"/>
      <form onSubmit={saveGeneral} className="grid gap-5 p-5 sm:grid-cols-2">
        <Field label="Trading name" required><input className="input" value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})}/></Field>
        <Field label="Legal name"><input className="input" value={form.legalName||''} onChange={e=>setForm({...form,legalName:e.target.value})}/></Field>
        <Field label="Registration number"><input className="input" value={form.regNumber||''} onChange={e=>setForm({...form,regNumber:e.target.value})}/></Field>
        <Field label="Country"><input className="input" value={form.country||''} onChange={e=>setForm({...form,country:e.target.value})}/></Field>
        <Field label="Base currency"><select className="select" value={form.baseCurrency||'USD'} onChange={e=>setForm({...form,baseCurrency:e.target.value})}>{['USD','ZWG','ZAR','EUR','GBP'].map(c=><option key={c}>{c}</option>)}</select></Field>
        <Field label="Headcount"><input className="input" type="number" value={form.headcount||''} onChange={e=>setForm({...form,headcount:e.target.value})}/></Field>
        <div className="sm:col-span-2"><Button type="submit" variant="primary" loading={saving} icon="Save">Save changes</Button></div>
      </form></Card>}

    {tab==='modules'&&<div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold">Module manager</p><p className="mt-0.5 text-xs muted">{enabled.size} of {meta.modules.length} modules enabled · changes take effect immediately across the sidebar and route guards.</p></div><Badge tone="green">{meta.config.plan} plan</Badge></Card>
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold">Start small or open everything</p><p className="mt-0.5 max-w-2xl text-xs muted">Focus mode keeps the 12 essential modules — one connected chain from clients to cash. Turn the full pack back on whenever you need the rest. Individual toggles below still work either way.</p></div>
        <div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" icon="Minimize2" loading={busy} onClick={()=>send('applyPack',{pack:'essentials'})}>Essentials (12)</Button><Button variant="primary" size="sm" icon="Layers" loading={busy} onClick={()=>send('applyPack',{pack:'full'})}>All modules</Button></div></Card>
      {Object.entries(grouped).map(([group,mods]:any)=><Card key={group}><CardHead title={group} subtitle={`${mods.filter((m:any)=>enabled.has(m.id)).length} of ${mods.length} enabled`}/>
        <div className="grid gap-px bg-slate-100 dark:bg-ink-800 sm:grid-cols-2">{mods.map((m:any)=><div key={m.id} className="flex items-start gap-3 bg-white p-4 dark:bg-ink-900">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-ink-500 dark:bg-ink-800 dark:text-slate-300"><Icon name={m.icon} size={16}/></span>
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-ink-900 dark:text-white">{m.label}</p><p className="mt-0.5 text-[11px] leading-relaxed muted">{m.description}</p><div className="mt-1.5 flex gap-1"><Badge tone={m.tier==='CORE'?'slate':m.tier==='ENTERPRISE'?'violet':'blue'}>{m.tier.toLowerCase()}</Badge>{m.resources?.length>0&&<Badge tone="slate">{m.resources.length} resources</Badge>}</div></div>
          <Toggle checked={enabled.has(m.id)} onChange={v=>send('toggleModule',{moduleId:m.id,enabled:v})}/></div>)}</div></Card>)}
    </div>}

    {tab==='users'&&<div className="space-y-4"><Card><CardHead title="Invite a teammate" subtitle="New users receive the temporary password Welcome@123"/>
      <div className="grid gap-4 p-5 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label="Full name"><input className="input" value={invite.name} onChange={e=>setInvite({...invite,name:e.target.value})} placeholder="Jane Moyo"/></Field>
        <Field label="Work email"><input className="input" type="email" value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})} placeholder="jane@company.co.zw"/></Field>
        <Field label="Role"><select className="select" value={invite.role} onChange={e=>setInvite({...invite,role:e.target.value})}>{ROLES.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></Field>
        <Button variant="primary" loading={busy} icon="UserPlus" onClick={()=>send('invite',invite,'POST').then(()=>setInvite({name:'',email:'',role:'VIEWER'}))}>Add user</Button>
      </div></Card>
      <Card className="overflow-hidden"><CardHead title="Team members" subtitle={`${meta.users.length} users in this workspace`}/>
        <div className="divide-y divider">{meta.users.map((u:any)=><div key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white" style={{background:u.avatarColor}}>{u.name.split(' ').map((w:string)=>w[0]).slice(0,2).join('')}</span>
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">{u.name}</p><p className="truncate text-[11px] muted">{u.email}</p></div>
          <Badge tone={u.role==='OWNER'?'green':u.role.endsWith('EXTERNAL')?'violet':'slate'}>{u.role.replace(/_/g,' ')}</Badge><span className="hidden text-[11px] muted sm:block">Joined {date(u.joined)}</span></div>)}</div></Card>
      <Card><CardHead title="Role permissions" subtitle="Read-only roles cannot write; restricted roles cannot edit finance or HR registers"/>
        <div className="grid gap-2 p-5 sm:grid-cols-2">{ROLES.map(r=><div key={r.id} className="rounded-lg border divider p-3"><p className="text-xs font-semibold">{r.label}</p><p className="mt-0.5 text-[11px] muted">{r.desc}</p></div>)}</div></Card></div>}

    {tab==='setup'&&<div className="space-y-4"><Card><CardHead title="Re-run workspace derivation" subtitle="Changing type or size recalculates your module pack, flags and plan limits"/>
      <div className="space-y-5 p-5"><div><p className="label">Company type</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{COMPANY_TYPES.map(t=><button key={t.id} onClick={()=>setType(t.id)} className={`flex items-center gap-2 rounded-lg border p-2.5 text-left text-xs transition ${type===t.id?'border-brand-400 bg-brand-50 dark:bg-brand-500/10':'divider'}`}><Icon name={t.icon} size={15}/>{t.label}</button>)}</div></div>
      <div><p className="label">Company size</p><div className="flex flex-wrap gap-2">{COMPANY_SIZES.map(s=><button key={s.id} onClick={()=>setSize(s.id)} className={`rounded-lg border px-3 py-2 text-xs transition ${size===s.id?'border-brand-400 bg-brand-50 dark:bg-brand-500/10':'divider'}`}><span className="font-semibold">{s.label}</span><span className="ml-1.5 muted">{s.range}</span></button>)}</div></div>
      <div><p className="label">Work-style qualifiers</p><div className="flex flex-wrap gap-2">{QUALIFIERS.map(q=><button key={q.id} onClick={()=>setQuals(v=>v.includes(q.id)?v.filter(x=>x!==q.id):[...v,q.id])} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition ${quals.includes(q.id)?'border-brand-400 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-300':'divider muted'}`}>{quals.includes(q.id)?<Lucide.Check size={12}/>:<Lucide.Plus size={12}/>}{q.label}</button>)}</div></div>
      <Button variant="primary" loading={busy} icon="RefreshCw" onClick={()=>send('reconfigure',{companyType:type,size,qualifiers:quals},'POST')}>Recalculate modules</Button></div></Card></div>}

    {tab==='data'&&<div className="space-y-4">
      <Card><CardHead title="Demo dataset" subtitle="616 realistic records across 49 resources — projects, people, POs, invoices, timesheets, RFIs, safety and more"/>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5"><p className="max-w-lg text-xs muted">This replaces all existing business records in this workspace with the demo dataset. Perfect for evaluating every screen with live, reconciled data.</p>
          <Button variant="primary" icon="Database" loading={busy} onClick={()=>setConfirm({title:'Replace data with demo dataset?',desc:'All existing records in this workspace will be deleted and replaced with 616 demo records.',action:'seedDemo'})}>Load demo data</Button></div></Card>
      <Card><CardHead title="Import CSV" subtitle="Paste a CSV with a header row matching field keys (e.g. name,status,amount)"/>
        <div className="grid gap-4 p-5 sm:grid-cols-[220px_1fr]"><Field label="Target resource"><select className="select" value={csvResource} onChange={e=>setCsvResource(e.target.value)}>{meta.resources.filter((r:any)=>meta.config.resources.includes(r.id)).map((r:any)=><option key={r.id} value={r.id}>{r.label}</option>)}</select></Field>
          <Field label="CSV data"><textarea className="input min-h-[100px] font-mono text-xs" value={csv} onChange={e=>setCsv(e.target.value)} placeholder={'name,type,city,status\nNew Client,Private developer,Harare,ACTIVE'}/></Field>
          <div className="sm:col-span-2"><Button variant="primary" icon="Upload" loading={busy} onClick={()=>{const rows=parseCsv(csv);if(!rows.length){toast.push({tone:'error',title:'No rows found',description:'Include a header row and at least one data row.'});return;}send('importCsv',{resource:csvResource,rows},'POST');}}>Import rows</Button></div></div></Card>
      <Card><CardHead title="Export & clear" subtitle="Download any dataset or wipe business records"/>
        <div className="flex flex-wrap items-center gap-3 p-5"><select className="select w-auto min-w-[200px]" value={csvResource} onChange={e=>setCsvResource(e.target.value)}>{meta.resources.filter((r:any)=>meta.config.resources.includes(r.id)).map((r:any)=><option key={r.id} value={r.id}>{r.label}</option>)}</select>
          <a href={orgApi(org,`records/${csvResource}?mode=csv`)} download><Button icon="Download">Export CSV</Button></a>
          <Button variant="ghost" className="text-red-600" icon="Trash2" onClick={()=>setConfirm({title:'Clear all business records?',desc:'Every record in this workspace will be deleted. Users, settings and modules are kept.',action:'clearData'})}>Clear all records</Button></div></Card></div>}

    {tab==='system'&&<div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[['Plan',meta.config.plan],['Modules enabled',num(meta.config.modules.length)],['Resource types',num(meta.config.resources.length)],['User limit',num(meta.config.limits.users)],['Project limit',num(meta.config.limits.projects)],['Storage',`${num(meta.config.limits.storageMb/1000)} GB`],['Regional pack',meta.config.localePack],['Currency',meta.org.baseCurrency]].map(([l,v])=><Card key={String(l)} className="p-4"><p className="text-[11px] font-semibold uppercase tracking-wider muted">{l}</p><p className="mt-1.5 text-lg font-semibold">{v}</p></Card>)}</div>
      <Card><CardHead title="Feature flags" subtitle="Derived from your company size and work-style answers"/>
        <div className="flex flex-wrap gap-2 p-5">{Object.entries(meta.config.flags).map(([k,v])=><Badge key={k} tone={v?'green':'slate'}>{k.replace(/([A-Z])/g,' $1').trim()}</Badge>)}</div></Card>
      <Card className="overflow-hidden"><CardHead title="Audit log" subtitle="Most recent workspace actions"/>
        <div className="divide-y divider">{meta.audit.slice(0,12).map((a:any)=><div key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5"><span className="text-xs font-medium">{a.actor}</span><span className="min-w-0 flex-1 truncate text-xs muted">{a.detail}</span><Badge tone={a.action==='DELETE'?'red':'slate'}>{a.action}</Badge><span className="text-[11px] muted">{date(a.createdAt)}</span></div>)}</div></Card></div>}
    <ConfirmDialog open={!!confirm} onClose={()=>setConfirm(null)} loading={busy} title={confirm?.title||''} description={confirm?.desc}
      onConfirm={()=>{if(!confirm)return;send(confirm.action,confirm.body||{},confirm.action==='invite'?'POST':'POST');}}/>
  </div>;
}
