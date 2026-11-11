'use client';
/* A calm, full-page quotation builder. It writes a normal estimates record,
 * so every downstream PDF, conversion and report works unchanged. */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend, orgApi } from '@/lib/client';
import { useDisplayCurrency, useDisplayMoney } from './DisplayCurrencyProvider';
import { CURRENCIES, PROJECT_TYPES, RESOURCE_MAP } from '@/lib/resources';
import { LINE_CATEGORIES } from '@/lib/financial';
import { resourceFullyEnabled } from '@/lib/module-visibility';
import {
  BUILT_IN_QUOTE_TEMPLATES, QUOTE_STEPS, blankQuoteDraft, quoteDraftFromRow,
  quoteDraftFromTemplate, quoteTotals, templatePayloadFromDraft, toRecordPayload,
  validateQuoteDraft, type QuoteDraft, type QuoteTemplate,
} from '@/lib/quote-studio';
import {
  Badge, Button, Card, CardHead, ConfirmDialog, Field, Icon, Skeleton,
} from './ui';
import { useToast } from './Providers';
import SearchSelect from './SearchSelect';
import QuoteLinesEditor from './QuoteLinesEditor';
import QuotePreview from './QuotePreview';

type TemplateData = { templates: QuoteTemplate[]; starters: QuoteTemplate[]; canWrite: boolean };

const SCOPE_SNIPPETS = [
  { label:'Included', text:'Includes all labour, materials, supervision, plant and site cleaning listed above.' },
  { label:'Excluded', text:'Excludes statutory approvals, unforeseen underground services, builder work and variations not listed above.' },
  { label:'Validity', text:'This quotation is valid for 30 days from the date shown.' },
  { label:'Access', text:'The client will provide safe site access, water and electricity during normal working hours.' },
  { label:'Payment', text:'Payment terms are 30 days from date of invoice unless otherwise agreed in writing.' },
];

export default function QuoteStudio({
  org, mode, recordId, initialRow,
}: {
  org: string; mode: 'create' | 'edit'; recordId?: string; initialRow?: any;
}) {
  const router = useRouter(); const qc = useQueryClient(); const toast = useToast();
  const formatMoney=useDisplayMoney(); const display=useDisplayCurrency();
  const [draft, setDraft] = useState<QuoteDraft>(() => initialRow ? quoteDraftFromRow(initialRow) : blankQuoteDraft());
  const [step, setStep] = useState(mode === 'edit' ? 1 : 0);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<QuoteTemplate | null>(null);
  const [deleteFor, setDeleteFor] = useState<QuoteTemplate | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [templateMode, setTemplateMode] = useState<'create'|'update'>('create');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);

  const { data: meta }: any = useQuery({ queryKey:['meta',org], queryFn:()=>apiGet(orgApi(org,'meta')) });
  const config = meta?.config || { modules:[], resources:[] };
  const orgName = meta?.org?.name || 'Your company';
  const clientLabel = (meta?.clients || []).find((c:any)=>c.id===draft.clientId)?.label || '';
  const clientsEnabled = resourceFullyEnabled(config, 'clients');
  const leadsEnabled = resourceFullyEnabled(config, 'leads');
  const { data: templateData, isLoading: templatesLoading } = useQuery<TemplateData>({
    queryKey:['quote-templates',org], queryFn:()=>apiGet(orgApi(org,'quote-templates')),
  });
  const savedTemplates = templateData?.templates || [];
  const activeSaved = savedTemplates.find(t=>t.id===activeTemplateId) || null;
  const canWriteTemplates = templateData?.canWrite !== false;
  const totals = quoteTotals(draft);
  const statuses = RESOURCE_MAP.estimates.statusOptions || ['DRAFT'];
  const liveValidation = validateQuoteDraft(draft, draft.status !== 'DRAFT');
  const progress = Math.round(((step + 1) / QUOTE_STEPS.length) * 100);
  const backHref = `/${org}/m/estimates`;

  const setField = <K extends keyof QuoteDraft>(key: K, value: QuoteDraft[K]) => {
    setDraft(d=>({ ...d, [key]:value }));
    setErrors(e=>{ const next={...e}; delete next[key]; return next; });
  };
  const setStatus = (status: string) => setDraft(d=>({
    ...d, status,
    submittedDate: status === 'SUBMITTED' && !d.submittedDate ? new Date().toISOString().slice(0,10) : d.submittedDate,
  }));
  const addScope = (text: string) => setField('scope', draft.scope.trim() ? `${draft.scope.trim()}\n${text}` : text);
  const goStep = (i: number) => setStep(Math.max(0, Math.min(QUOTE_STEPS.length - 1, i)));

  function useTemplate(t: QuoteTemplate) {
    if (draft.name.trim() || draft.items.some(l => l.description.trim() || l.unitPrice > 0)) setPendingTemplate(t);
    else applyTemplate(t);
  }
  function applyTemplate(t: QuoteTemplate) {
    setDraft(d=>quoteDraftFromTemplate(t, d));
    setActiveTemplateId(t.builtIn ? null : t.id);
    setTemplateName(t.name);
    setTemplateDescription(t.description);
    setErrors({}); setPendingTemplate(null); goStep(1);
    toast.push({ tone:'success', title:`${t.name} loaded`, description:'Your client, date and status stay in your control.' });
  }
  function openSaveTemplate(nextMode: 'create'|'update') {
    setTemplateMode(nextMode);
    setTemplateName(nextMode === 'update' && activeSaved ? activeSaved.name : (draft.name ? `${draft.name} template` : ''));
    setTemplateDescription(nextMode === 'update' && activeSaved ? activeSaved.description : 'A reusable starting point for similar jobs.');
    setSaveOpen(true);
  }
  async function saveTemplate() {
    const name = templateName.trim();
    if (name.length < 2) { toast.push({ tone:'error', title:'Give the template a name' }); return; }
    setBusy(true);
    try {
      const body:any = {
        action: templateMode === 'update' && activeSaved ? 'update' : 'create',
        name, description: templateDescription.trim(), payload: templatePayloadFromDraft(draft),
      };
      if (body.action === 'update' && activeSaved) body.id = activeSaved.id;
      const res = await apiSend(orgApi(org,'quote-templates'), 'POST', body);
      if (res.template) setActiveTemplateId(res.template.id);
      await qc.invalidateQueries({ queryKey:['quote-templates',org] });
      setSaveOpen(false);
      toast.push({ tone:'success', title:body.action === 'update' ? 'Template updated' : 'Template saved', description:'It is ready for the next quotation.' });
    } catch (e:any) { toast.push({ tone:'error', title:'Could not save template', description:e.message }); }
    finally { setBusy(false); }
  }
  async function updateTemplate(t: QuoteTemplate) {
    setBusy(true);
    try {
      await apiSend(orgApi(org,'quote-templates'), 'POST', {
        action:'update', id:t.id, name:t.name, description:t.description,
        payload: templatePayloadFromDraft(draft),
      });
      setActiveTemplateId(t.id);
      await qc.invalidateQueries({ queryKey:['quote-templates',org] });
      toast.push({ tone:'success', title:'Template refreshed', description:`“${t.name}” now matches this draft.` });
    } catch (e:any) { toast.push({ tone:'error', title:'Could not update template', description:e.message }); }
    finally { setBusy(false); }
  }
  async function removeTemplate(t: QuoteTemplate) {
    setBusy(true);
    try {
      await apiSend(orgApi(org,'quote-templates'), 'POST', { action:'delete', id:t.id });
      if (activeTemplateId === t.id) setActiveTemplateId(null);
      await qc.invalidateQueries({ queryKey:['quote-templates',org] });
      toast.push({ tone:'success', title:'Template deleted' });
    } catch (e:any) { toast.push({ tone:'error', title:'Could not delete template', description:e.message }); }
    finally { setBusy(false); setDeleteFor(null); }
  }
  async function createClient() {
    const name = newClientName.trim();
    if (!name) return;
    setCreatingClient(true);
    try {
      const res = await apiSend(orgApi(org,'records/clients'), 'POST', { name, status:'PROSPECT', paymentTerms:30 });
      setField('clientId', res.row.id);
      await qc.invalidateQueries({ queryKey:['meta',org] });
      await qc.invalidateQueries({ queryKey:['refSearch',org,'clients'] });
      setShowNewClient(false); setNewClientName('');
      toast.push({ tone:'success', title:'Client added', description:`${name} is now selected for this quotation.` });
    } catch (e:any) { toast.push({ tone:'error', title:'Could not add client', description:e.message }); }
    finally { setCreatingClient(false); }
  }
  async function saveQuote() {
    const nextErrors = validateQuoteDraft(draft, draft.status !== 'DRAFT');
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      goStep(nextErrors.items ? 2 : 1);
      toast.push({ tone:'error', title:'A few details are still needed', description:Object.values(nextErrors)[0] });
      return;
    }
    setSaving(true);
    try {
      const payload = toRecordPayload(draft, draft.status);
      const endpoint = mode === 'edit' && recordId ? `records/estimates/${recordId}` : 'records/estimates';
      const res = mode === 'edit'
        ? await apiSend(orgApi(org,endpoint), 'PATCH', payload)
        : await apiSend(orgApi(org,endpoint), 'POST', payload);
      await qc.invalidateQueries({ queryKey:['records',org,'estimates'] });
      toast.push({ tone:'success', title:mode === 'edit' ? 'Quotation updated' : 'Quotation created', description:`${res.row.number} · ${formatMoney(res.row.total, res.row.currency || draft.currency)}` });
      router.push(`/${org}/m/estimates?open=${encodeURIComponent(res.row.id)}`);
    } catch (e:any) { toast.push({ tone:'error', title:'Could not save quotation', description:e.message }); }
    finally { setSaving(false); }
  }

  const stepRail = <Card className="p-3 lg:sticky lg:top-4">
    <p className="px-1 text-[10px] font-semibold uppercase tracking-wider muted">Build path</p>
    <div className="mt-3 flex gap-1.5 overflow-x-auto lg:block lg:space-y-1 lg:overflow-visible">
      {QUOTE_STEPS.map((s,i)=>{
        const active=i===step, done=i<step;
        return <button key={s.id} type="button" onClick={()=>goStep(i)}
          className={`flex min-w-[150px] items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition lg:w-full ${active?'bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-200':done?'text-ink-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-ink-800':'muted hover:bg-slate-50 dark:hover:bg-ink-800'}`}>
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${active?'bg-brand-500 text-ink-950':done?'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300':'bg-slate-100 text-ink-500 dark:bg-ink-800 dark:text-slate-400'}`}>
            {done?<Icon name="Check" size={13}/>:i+1}
          </span>
          <span className="min-w-0"><span className="block truncate text-xs font-semibold">{s.label}</span><span className="block truncate text-[10px] muted lg:mt-0.5">{s.hint}</span></span>
        </button>;
      })}
    </div>
  </Card>;

  const summary = <Card className="p-4 lg:sticky lg:top-4">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-[10px] font-semibold uppercase tracking-wider muted">Live quotation</p><h3 className="mt-1 text-sm font-semibold text-ink-900 dark:text-white">{draft.name || 'Untitled quotation'}</h3></div>
      <Badge tone="blue">{step+1} / {QUOTE_STEPS.length}</Badge>
    </div>
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-ink-800"><div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{width:`${progress}%`}}/></div>
    {display.preference&&display.currency!==draft.currency&&<p className="mt-2 text-[10px] leading-relaxed muted">Viewing amounts in {display.currency}; the quotation will be saved in {draft.currency}.</p>}
    <div className="mt-4 space-y-2 text-xs">
      <div className="flex justify-between"><span className="muted">Priced lines</span><span className="font-semibold tabular-nums">{totals.lines.length}</span></div>
      <div className="flex justify-between"><span className="muted">Cost subtotal</span><span className="font-semibold tabular-nums">{formatMoney(totals.subtotal,draft.currency)}</span></div>
      <div className="flex justify-between"><span className="muted">Markup ({totals.markupPct}%)</span><span className="tabular-nums">{formatMoney(totals.markupAmount,draft.currency)}</span></div>
      <div className="flex justify-between border-t divider pt-2 text-base"><span className="font-semibold">Quote total</span><span className="font-bold tabular-nums text-brand-700 dark:text-brand-300">{formatMoney(totals.total,draft.currency)}</span></div>
    </div>
    <div className="mt-4 space-y-1.5 border-t divider pt-3">
      {[
        ['Client chosen', !!draft.clientId], ['Priced lines added', totals.lines.length>0],
        ['Scope written', !!draft.scope.trim()], ['Status set', !!draft.status],
      ].map(([label,ok])=><div key={String(label)} className="flex items-center gap-2 text-[11px]"><Icon name={ok?'CheckCircle2':'CircleDot'} size={13} className={ok?'text-emerald-500':'text-slate-300 dark:text-ink-700'}/><span className={ok?'text-ink-700 dark:text-slate-200':'muted'}>{label}</span></div>)}
    </div>
    <Button type="button" size="sm" className="mt-4 w-full" icon="Save" disabled={!canWriteTemplates||busy} onClick={()=>openSaveTemplate('create')}>Save as template</Button>
    {activeSaved&&<Button type="button" size="sm" variant="ghost" className="mt-2 w-full" icon="RefreshCw" loading={busy} onClick={()=>updateTemplate(activeSaved)}>Update “{activeSaved.name}”</Button>}
  </Card>;

  return <div className="space-y-5">
    <div className="relative overflow-hidden rounded-xl border divider bg-gradient-to-br from-ink-900 via-ink-900 to-ink-800 px-5 py-5 text-white shadow-panel">
      <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full border border-brand-500/20"/><div className="absolute right-12 top-5 h-20 w-20 rounded-full bg-brand-500/10"/>
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><Badge tone="blue">Quote Studio</Badge><Badge tone="slate">{mode==='edit'?`Editing ${initialRow?.number||'quotation'}`:'New quotation'}</Badge></div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{mode==='edit'?'Polish this quotation':'Create a quotation without the guesswork'}</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-300">Five calm steps, plain-language pricing and a live preview. Start from a reusable package or build your own — every total is calculated for you.</p>
        </div>
        <div className="flex flex-wrap gap-2"><Link href={backHref}><Button variant="outline" icon="ArrowLeft">Back to quotes</Button></Link></div>
      </div>
    </div>

    <div className="grid gap-4 lg:grid-cols-12">
      <aside className="lg:col-span-3">{stepRail}</aside>
      <main className="min-w-0 space-y-4 lg:col-span-6">
        {saveOpen&&<Card className="p-4"><CardHead title={templateMode==='update'?'Update this template':'Save as a reusable template'} subtitle="Templates store the title, work type, pricing lines, markup and scope — never a client or date."/>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Template name" required><input className="input" value={templateName} onChange={e=>setTemplateName(e.target.value)} placeholder="e.g. Small office fit-out" autoFocus/></Field>
            <Field label="Description" hint="Helps your team pick the right starting point."><input className="input" value={templateDescription} onChange={e=>setTemplateDescription(e.target.value)} placeholder="What is this package for?"/></Field>
            <div className="flex gap-2 sm:col-span-2"><Button type="button" variant="primary" icon="Save" loading={busy} onClick={saveTemplate}>{templateMode==='update'?'Update template':'Save template'}</Button><Button type="button" onClick={()=>setSaveOpen(false)}>Cancel</Button></div>
          </div>
        </Card>}

        {step===0&&<div className="space-y-4">
          <Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div className="max-w-lg"><p className="text-[10px] font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">Start simply</p><h2 className="mt-1 text-lg font-semibold text-ink-900 dark:text-white">Blank quote or a ready-made package?</h2><p className="caption mt-1">A starter gives you sensible lines and wording to edit. You can still change every quantity, rate and word before saving.</p></div>
            <Button type="button" variant="primary" icon="ArrowRight" onClick={()=>{ if(mode==='create'){ setDraft(blankQuoteDraft()); setActiveTemplateId(null); } goStep(1); }}>{mode==='create'?'Start blank':'Use current quote'}</Button></div></Card>

          <Card className="overflow-hidden"><CardHead title="Starter packages" subtitle="Built in and always available · click one to load its lines" action={<Badge tone="slate">{BUILT_IN_QUOTE_TEMPLATES.length} starters</Badge>}/>
            <div className="grid gap-3 p-4 sm:grid-cols-2">{BUILT_IN_QUOTE_TEMPLATES.map(t=>{
              const previewTotals=quoteTotals(quoteDraftFromTemplate(t));
              return <button type="button" key={t.id} onClick={()=>useTemplate(t)} className={`group rounded-lg border divider bg-gradient-to-br ${t.accent||'from-slate-50 to-white'} p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-panel dark:from-ink-900 dark:to-ink-950`}>
                <div className="flex items-start justify-between gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-brand-600 shadow-card dark:bg-ink-900 dark:text-brand-300"><Icon name={t.icon||'FileText'} size={17}/></span><Icon name="ArrowRight" size={15} className="mt-1 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600"/></div>
                <p className="mt-3 text-sm font-semibold text-ink-900 dark:text-white">{t.name}</p><p className="mt-1 text-[11px] leading-relaxed muted">{t.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5"><Badge tone="slate">{t.payload.items.length} lines</Badge><Badge tone="blue">{t.payload.markup}% markup</Badge><Badge tone="green">{formatMoney(previewTotals.total,t.payload.currency)}</Badge></div>
              </button>;
            })}</div>
          </Card>

          <Card className="overflow-hidden"><CardHead title="Your saved templates" subtitle="Shared with your workspace · update or remove them any time" action={<Badge tone="slate">{savedTemplates.length} saved</Badge>}/>
            {templatesLoading?<div className="p-4"><Skeleton className="h-24"/></div>:!savedTemplates.length?<div className="p-6 text-center"><Icon name="Sparkles" size={20} className="mx-auto text-brand-500"/><p className="mt-2 text-sm font-semibold">No saved templates yet</p><p className="caption mt-1">Build a quote once, then use “Save as template” to reuse the wording and pricing structure.</p></div>:
              <div className="grid gap-3 p-4 sm:grid-cols-2">{savedTemplates.map(t=><div key={t.id} className="rounded-lg border divider p-3.5">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{t.name}</p><p className="mt-0.5 line-clamp-2 text-[11px] muted">{t.description||'Reusable quote package'}</p></div><Badge tone="violet">Saved</Badge></div>
                <p className="mt-2 text-[10px] muted">{t.payload.items.length} lines · {t.payload.markup}% markup · {t.payload.currency}</p>
                <div className="mt-3 flex flex-wrap gap-1.5"><Button type="button" size="sm" variant="primary" icon="ArrowRight" onClick={()=>useTemplate(t)}>Use</Button><Button type="button" size="sm" variant="ghost" icon="RefreshCw" loading={busy} onClick={()=>updateTemplate(t)}>Update</Button><Button type="button" size="sm" variant="ghost" className="text-red-600" icon="Trash2" onClick={()=>setDeleteFor(t)}>Delete</Button></div>
              </div>)}</div>}
          </Card>
        </div>}

        {step===1&&<Card className="overflow-hidden"><CardHead title="Client & job details" subtitle="Start with the essentials — the rest can be added later."/>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Quotation title" required error={errors.name} hint="Use words your client will recognise, e.g. “Borrowdale office fit-out – Phase 1”."><input className="input" value={draft.name} onChange={e=>setField('name',e.target.value)} placeholder="What are you quoting for?"/></Field></div>
            <div className="sm:col-span-2"><Field label="Client" error={errors.clientId} hint="The client is linked to this quote and appears on the PDF. You can save a draft without one.">{clientsEnabled
              ? <SearchSelect org={org} resource="clients" value={draft.clientId} onChange={v=>setField('clientId',v)} label="Client" placeholder="Search clients by name or number…"/>
              : <div className="rounded-md border divider bg-slate-50 px-3 py-2.5 text-xs muted dark:bg-ink-950/40">The Clients module is switched off for this workspace. Enable it in Settings to link a client.</div>}</Field>
              {clientsEnabled&&<div className="mt-2">{!showNewClient?<button type="button" className="text-[11px] font-semibold text-brand-700 hover:underline dark:text-brand-300" onClick={()=>setShowNewClient(true)}>+ Add a new client without leaving this page</button>:
                <div className="flex flex-wrap items-end gap-2 rounded-md border divider bg-slate-50 p-2.5 dark:bg-ink-950/40"><div className="min-w-[200px] flex-1"><Field label="New client name"><input className="input" value={newClientName} onChange={e=>setNewClientName(e.target.value)} placeholder="Company or person name"/></Field></div><Button type="button" size="sm" variant="primary" icon="UserPlus" loading={creatingClient} onClick={createClient}>Add client</Button><Button type="button" size="sm" onClick={()=>{setShowNewClient(false);setNewClientName('');}}>Cancel</Button></div>}</div>}
            </div>
            <Field label="Work type"><select className="select" value={draft.workType} onChange={e=>setField('workType',e.target.value)}>{PROJECT_TYPES.map(x=><option key={x} value={x}>{x}</option>)}</select></Field>
            <Field label="Currency"><select className="select" value={draft.currency} onChange={e=>setField('currency',e.target.value)}>{CURRENCIES.map(x=><option key={x} value={x}>{x}</option>)}</select></Field>
            <Field label="Quotation date"><input className="input" type="date" value={draft.submittedDate} onChange={e=>setField('submittedDate',e.target.value)}/></Field>
            <Field label="Revision"><input className="input" type="number" min="0" step="1" value={draft.revision} onChange={e=>setField('revision',Math.max(0,Number(e.target.value)||0))}/></Field>
            {leadsEnabled&&<div className="sm:col-span-2"><Field label="Linked enquiry" hint="Optional — keeps the quote connected to the original opportunity."><SearchSelect org={org} resource="leads" value={draft.leadId} onChange={v=>setField('leadId',v)} label="Linked enquiry" placeholder="Search enquiries…"/></Field></div>}
          </div>
        </Card>}

        {step===2&&<div className="space-y-4">
          <Card className="overflow-hidden"><CardHead title="Build the price" subtitle="One line per work item. Categories keep the cost breakdown understandable." action={<Badge tone="slate">{totals.lines.length} priced lines</Badge>}/>
            <div className="p-4"><QuoteLinesEditor value={draft.items} onChange={items=>setField('items',items)} currency={draft.currency}/>{errors.items&&<p className="mt-2 text-xs text-red-600 dark:text-red-400">{errors.items}</p>}</div>
          </Card>
          <Card className="p-4"><div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]"><div><Field label="Markup" hint="Added to your cost subtotal to cover overhead, risk and profit."><div className="relative"><input className="input pr-9" type="number" min="0" max="1000" step="any" value={draft.markup} onChange={e=>setField('markup',Math.max(0,Math.min(1000,Number(e.target.value)||0)))}/><span className="absolute right-3 top-2 text-xs muted">%</span></div></Field>
            <div className="mt-2 flex flex-wrap gap-1.5">{[10,15,20,25].map(v=><button type="button" key={v} onClick={()=>setField('markup',v)} className={`rounded border px-2 py-1 text-[11px] font-semibold ${draft.markup===v?'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300':'divider muted hover:border-brand-400'}`}>{v}%</button>)}</div></div>
            <div className="rounded-lg border divider bg-slate-50 p-3 dark:bg-ink-950/40"><p className="text-[10px] font-semibold uppercase tracking-wide muted">Cost breakdown</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{LINE_CATEGORIES.map(c=><div key={c.id} className="flex items-center justify-between gap-2 text-xs"><span className="muted">{c.label}</span><span className="font-semibold tabular-nums">{formatMoney(totals.byCategory[c.id],draft.currency)}</span></div>)}</div><p className="mt-3 border-t divider pt-2 text-[11px] leading-relaxed muted">Subtotal + {totals.markupPct}% markup = <span className="font-semibold text-ink-900 dark:text-white">{formatMoney(totals.total,draft.currency)}</span> quotation total.</p></div></div>
          </Card>
        </div>}

        {step===3&&<div className="space-y-4">
          <Card className="overflow-hidden"><CardHead title="Scope & terms" subtitle="Say what is included, excluded and how long the price is valid."/>
            <div className="p-4"><Field label="Plain-language scope"><textarea className="input min-h-[180px] resize-y py-2.5 leading-relaxed" value={draft.scope} onChange={e=>setField('scope',e.target.value)} placeholder="Example: Includes all labour, materials and supervision listed above. Excludes statutory approvals and variations. Valid for 30 days."/></Field>
              <div className="mt-3 flex flex-wrap gap-1.5">{SCOPE_SNIPPETS.map(s=><button type="button" key={s.label} onClick={()=>addScope(s.text)} className="rounded-md border divider px-2.5 py-1.5 text-[11px] font-medium text-ink-700 transition hover:border-brand-400 hover:text-brand-700 dark:text-slate-200"><Icon name="Plus" size={11} className="mr-1 inline"/>{s.label}</button>)}<button type="button" onClick={()=>setField('scope','')} className="rounded-md px-2.5 py-1.5 text-[11px] muted hover:bg-slate-100 dark:hover:bg-ink-800">Clear</button></div>
            </div>
          </Card>
          <Card className="p-4"><CardHead title="A quick sanity check" subtitle="Three things clients always ask about"/><div className="grid gap-3 p-4 sm:grid-cols-3">{[
            ['Inclusions','Have you listed the work, materials and supervision you will provide?'],
            ['Exclusions','Have you named approvals, unseen conditions and work you are not pricing?'],
            ['Validity','Have you said how long the price and payment terms last?'],
          ].map(([t,d])=><div key={t} className="rounded-lg border divider p-3"><Icon name="HelpCircle" size={16} className="text-brand-600"/><p className="mt-2 text-xs font-semibold">{t}</p><p className="mt-1 text-[11px] leading-relaxed muted">{d}</p></div>)}</div></Card>
        </div>}

        {step===4&&<div className="space-y-4">
          <QuotePreview draft={draft} clientLabel={clientLabel} orgName={orgName}/>
          <Card className="p-4"><CardHead title="Ready to save" subtitle="Choose where this quotation sits in your workflow."/>
            <div className="grid gap-4 p-4 sm:grid-cols-2"><Field label="Status" hint="Drafts can be saved without a client. Ready-to-send quotes need one."><select className="select" value={draft.status} onChange={e=>setStatus(e.target.value)}>{statuses.map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}</select></Field>
              <div className="rounded-lg border divider bg-slate-50 p-3 dark:bg-ink-950/40"><p className="text-[10px] font-semibold uppercase tracking-wide muted">Before you save</p><div className="mt-2 space-y-1.5">{Object.keys(liveValidation).length?Object.values(liveValidation).map((v,i)=><p key={i} className="flex gap-2 text-[11px] text-amber-700 dark:text-amber-300"><Icon name="AlertCircle" size={13} className="mt-0.5 shrink-0"/>{v}</p>):<p className="flex gap-2 text-[11px] text-emerald-700 dark:text-emerald-300"><Icon name="CheckCircle2" size={13} className="mt-0.5 shrink-0"/>Everything needed for a clean quotation is in place.</p>}</div></div></div>
          </Card>
        </div>}

        <div className="flex flex-wrap items-center justify-between gap-2"><Button type="button" icon="ChevronLeft" disabled={step===0} onClick={()=>goStep(step-1)}>Back</Button>
          <div className="flex gap-2"><Button type="button" variant="ghost" icon="Save" disabled={!canWriteTemplates||busy} onClick={()=>openSaveTemplate('create')}>Save template</Button>
            {step===QUOTE_STEPS.length-1?<Button type="button" variant="primary" icon="Check" loading={saving} onClick={saveQuote}>{mode==='edit'?'Save quotation':'Create quotation'}</Button>:<Button type="button" variant="primary" icon="ArrowRight" onClick={()=>goStep(step+1)}>Continue</Button>}</div>
        </div>
      </main>
      <aside className="lg:col-span-3">{summary}</aside>
    </div>

    <ConfirmDialog open={!!pendingTemplate} onClose={()=>setPendingTemplate(null)} title="Replace the current draft?"
      description="Using a template replaces the title, pricing lines, markup and scope. Your client, date and status will be kept."
      confirmLabel="Use template" onConfirm={()=>pendingTemplate&&applyTemplate(pendingTemplate)}/>
    <ConfirmDialog open={!!deleteFor} onClose={()=>setDeleteFor(null)} loading={busy} title={`Delete “${deleteFor?.name||'template'}”?`}
      description="This removes the saved starting point. Quotations already created from it are not affected."
      onConfirm={()=>deleteFor&&removeTemplate(deleteFor)}/>
  </div>;
}
