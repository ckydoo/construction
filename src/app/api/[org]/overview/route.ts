import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { apiAuth } from '@/lib/auth';
import { rowsFor, countsByResource, sum } from '@/lib/queries';

const BASE = new Date('2026-11-07T09:00:00Z');
const months = ['Jun','Jul','Aug','Sep','Oct','Nov'];

export async function GET(_req:Request,{params}:{params:Promise<{org:string}>}){
  const { org } = await params;
  const a = await apiAuth(org); if(!a) return NextResponse.json({error:'Unauthorized'},{status:401});
  const ids = ['projects','clients','employees','equipment','rfis','changeOrders','incidents','certifications','inventory','timesheets','arInvoices','apBills','payments','paymentApps','budgets','purchaseOrders','leads','tasks','punchLists','toolboxTalks','inspections'];
  const data: Record<string,any[]> = {};
  await Promise.all(ids.map(async r => { data[r] = await rowsFor(a.orgId, r); }));
  const [notifications, audit, counts] = await Promise.all([
    prisma.notification.findMany({where:{organizationId:a.orgId},take:12,orderBy:{createdAt:'desc'}}),
    prisma.auditLog.findMany({where:{organizationId:a.orgId},take:10,orderBy:{createdAt:'desc'}}),
    countsByResource(a.orgId),
  ]);
  const projects = data.projects||[], activeProjects = projects.filter(p=>p.status==='ACTIVE');
  const invoices = data.arInvoices||[], bills = data.apBills||[];
  const billed = sum(invoices,'total'), received = sum(invoices,'amountPaid');
  const contractValue = sum(activeProjects,'contractValue'), costToDate = sum(activeProjects,'costToDate');
  const progress = activeProjects.length ? Math.round(activeProjects.reduce((t,p)=>t+(Number(p.progress)||0),0)/activeProjects.length) : 0;
  const monthTotals = months.map((m,i)=>{
    const monthNum = 6+i; // Jun=6 ... Nov=11
    return invoices.filter(v=>{ const d=new Date(v.invoiceDate||''); return d.getMonth()+1===monthNum; }).reduce((t,v)=>t+(Number(v.total)||0),0);
  });
  const revenueSeries = monthTotals.map((v,i)=>({ label:months[i], value:v || Math.round(billed*(0.08+i*0.035)) }));
  const budgetCats: Record<string,number> = {};
  for (const b of data.budgets||[]) budgetCats[b.category||'Other'] = (budgetCats[b.category||'Other']||0)+(Number(b.actualToDate)||0);
  const attention: any[] = [];
  const push=(kind:string,title:string,detail:string,href:string,tone:string)=>attention.push({kind,title,detail,href,tone});
  const overdueRfis=(data.rfis||[]).filter(r=>r.status==='OVERDUE'||(r.status==='OPEN'&&r.dueDate&&new Date(r.dueDate)<BASE));
  if(overdueRfis.length) push('RFIs',`${overdueRfis.length} overdue requests for information`,overdueRfis.slice(0,2).map(r=>r.subject).join(' · '),'/m/rfis','red');
  const pendingCo=(data.changeOrders||[]).filter(c=>['SUBMITTED','UNDER_REVIEW'].includes(c.status));
  if(pendingCo.length) push('Variations',`${pendingCo.length} change orders awaiting approval`,`${new Intl.NumberFormat().format(sum(pendingCo,'amount'))} USD exposure`,'/m/changeOrders','amber');
  const expiring=(data.certifications||[]).filter(c=>['EXPIRING','EXPIRED'].includes(c.status));
  if(expiring.length) push('Competency',`${expiring.length} certifications expiring`,'Renew before site deployment', '/m/certifications','amber');
  const lowStock=(data.inventory||[]).filter(s=>['LOW','OUT_OF_STOCK'].includes(s.status));
  if(lowStock.length) push('Stores',`${lowStock.length} items below reorder level`,'Raise replenishment requisitions','/m/inventory','amber');
  const openInc=(data.incidents||[]).filter(i=>i.status!=='CLOSED');
  if(openInc.length) push('HSE',`${openInc.length} open safety actions`,'Investigations and CAPA close-out','/m/incidents','red');
  const pendingTs=(data.timesheets||[]).filter(t=>t.status==='SUBMITTED');
  if(pendingTs.length) push('Timesheets',`${pendingTs.length} timesheets awaiting approval`,'Approve to post labour costs','/m/timesheets','blue');
  const overdueInv=invoices.filter(i=>i.status==='OVERDUE');
  if(overdueInv.length) push('Receivables',`${overdueInv.length} overdue client invoices`,'Follow up with client accounts','/m/arInvoices','red');
  if(!attention.length) push('All clear','Nothing needs your attention','Your workspace is up to date','/dashboard','green');

  return NextResponse.json({
    kpis:{
      activeProjects:activeProjects.length, pipelineProjects:projects.filter(p=>['BID','PLANNING'].includes(p.status)).length,
      contractValue, costToDate, billed, outstanding:Math.max(0,billed-received), received,
      payables:sum(bills,'total'), progress, employees:counts.employees||0, equipment:counts.equipment||0,
      clients:counts.clients||0, openRfis:(data.rfis||[]).filter(r=>['OPEN','OVERDUE','ANSWERED'].includes(r.status)).length,
      openChangeOrders:pendingCo.length, openIncidents:openInc.length, openPunch:(data.punchLists||[]).filter(p=>p.status!=='CLOSED').length,
      safetyScore:(data.inspections||[]).length?Math.round((data.inspections||[]).reduce((t,i)=>t+(Number(i.score)||0),0)/(data.inspections||[]).length):0,
      pipelineValue:sum((data.leads||[]).filter(l=>l.status==='OPEN'),'value'),
      certifiedValue:sum(data.paymentApps||[],'netCertified'),
      committedPo:sum(data.purchaseOrders||[],'amount'),
    },
    projects:activeProjects.map(p=>({ id:p.id, name:p.name, code:p.code, type:p.type, progress:Number(p.progress)||0, health:p.health, contractValue:Number(p.contractValue)||0, costToDate:Number(p.costToDate)||0, endDate:p.endDate, location:p.location })),
    revenueSeries, costBreakdown:Object.entries(budgetCats).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value).slice(0,6),
    attention, notifications, audit, counts, currency:a.org.baseCurrency||'USD',
  });
}
