import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { rowsFor, sum } from '@/lib/queries';
import { getResource } from '@/lib/resources';
import { getRecord } from '@/lib/records';

export async function GET(_req:Request,{params}:{params:Promise<{org:string;id:string}>}){
  const { org, id } = await params;
  const a = await apiAuth(org); if(!a) return NextResponse.json({error:'Unauthorized'},{status:401});
  const project = await getRecord(a.orgId,'projects',id);
  if(!project) return NextResponse.json({error:'Project not found'},{status:404});
  const related = ['tasks','contracts','changeOrders','rfis','submittals','documents','dailyLogs','meetings','punchLists','permits','budgets','arInvoices','paymentApps','purchaseOrders','timesheets','incidents','inspections','ncrs','equipment','crews','expenses'];
  const grouped: Record<string,any[]> = {};
  await Promise.all(related.map(async r => {
    const rows = await rowsFor(a.orgId,r);
    grouped[r] = rows.filter(x=>x.projectId===id);
  }));
  const budgets=grouped.budgets||[], invoices=grouped.arInvoices||[], apps=grouped.paymentApps||[];
  const totals={
    originalBudget:sum(budgets,'originalBudget'), committed:sum(budgets,'committed'), actual:sum(budgets,'actualToDate'),
    forecast:sum(budgets,'forecastToComplete'), billed:sum(invoices,'total'), received:sum(invoices,'amountPaid'),
    certified:sum(apps,'netCertified'), variations:sum(grouped.changeOrders||[],'amount'),
    tasksComplete:(grouped.tasks||[]).filter(t=>t.status==='COMPLETE').length, tasksTotal:(grouped.tasks||[]).length,
  };
  return NextResponse.json({ project, grouped, totals, defs:Object.fromEntries(related.map(r=>[r,getResource(r)])) });
}
