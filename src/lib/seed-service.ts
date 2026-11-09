import type { PrismaClient } from '@prisma/client';
import { buildDemo } from './demo';

export async function seedDemo(prisma: PrismaClient, orgId: string) {
  const demo = buildDemo(orgId);
  await prisma.record.deleteMany({ where: { organizationId: orgId } });
  await prisma.sequence.deleteMany({ where: { organizationId: orgId } });
  await prisma.notification.deleteMany({ where: { organizationId: orgId } });
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
  await prisma.comment.deleteMany({ where: { organizationId: orgId } });
  for (let i=0;i<demo.records.length;i+=100) {
    await prisma.record.createMany({ data: demo.records.slice(i,i+100).map(r => ({
      id:r.id, organizationId:orgId, resource:r.resource, number:r.number, title:r.title,
      status:r.status, projectId:r.projectId, data:JSON.stringify(r.data),
      createdAt:r.createdAt, updatedAt:r.updatedAt,
    })) });
  }
  const byRes: Record<string,number> = {};
  for (const r of demo.records) byRes[r.resource] = (byRes[r.resource]||0)+1;
  await prisma.sequence.createMany({ data: Object.entries(byRes).map(([resource,n]) => ({ organizationId:orgId, resource, next:n+1 })) });
  await prisma.notification.createMany({ data: demo.notifications });
  await prisma.auditLog.createMany({ data: demo.auditLogs });
  await prisma.comment.createMany({ data: demo.comments });

  // ── Client wallets: one prepaid account per client, with a reconciled ledger ──
  await prisma.walletTransaction.deleteMany({ where: { organizationId: orgId } });
  await prisma.wallet.deleteMany({ where: { organizationId: orgId } });
  const BASE = new Date('2026-11-07T09:00:00Z');
  const at = (days: number) => new Date(BASE.getTime() + days * 86400000);
  const client = (key: string) => `${orgId}_${key}`;
  const project = (key: string) => `${orgId}_${key}`;
  type Step = { kind: 'TOPUP'|'ALLOCATION'|'REVERSAL'; amount: number; days: number;
    projectKey?: string; reference?: string; method?: string; note?: string; actor?: string };
  const walletSeeds: { clientKey: string; steps: Step[] }[] = [
    { clientKey:'cli-1', steps:[
      { kind:'TOPUP', amount:300000000, days:-60, reference:'RTGS-2026-0912', method:'Bank transfer (USD)', note:'Advance payment deposit – Phase 2', actor:'Farai Nyamayaro' },
      { kind:'ALLOCATION', amount:-125000000, days:-45, projectKey:'prj-1', note:'Mobilisation advance – Borrowdale Phase 2', actor:'Tendai Muchengeti' },
      { kind:'TOPUP', amount:200000000, days:-20, reference:'RTGS-2026-1044', method:'Bank transfer (USD)', note:'Second tranche received', actor:'Farai Nyamayaro' },
      { kind:'ALLOCATION', amount:-80000000, days:-8, projectKey:'prj-1', note:'Structural steel package funding', actor:'Lisa Goromonzi' },
    ]},
    { clientKey:'cli-2', steps:[
      { kind:'TOPUP', amount:420000000, days:-70, reference:'RTGS-2026-0831', method:'Bank transfer (USD)', note:'Plant expansion advance', actor:'Farai Nyamayaro' },
      { kind:'ALLOCATION', amount:-140000000, days:-40, projectKey:'prj-2', note:'Civil works tranche 1', actor:'Tendai Muchengeti' },
      { kind:'ALLOCATION', amount:-20000000, days:-15, projectKey:'prj-2', note:'Duplicate allocation (reversed)', actor:'Rutendo Chikomba' },
      { kind:'REVERSAL', amount:20000000, days:-10, projectKey:'prj-2', note:'Reversed duplicate allocation', actor:'Farai Nyamayaro' },
    ]},
    { clientKey:'cli-3', steps:[
      { kind:'TOPUP', amount:300000000, days:-65, reference:'TREAS-2026-0441', method:'Treasury warrant', note:'Road rehabilitation vote 3', actor:'Farai Nyamayaro' },
      { kind:'ALLOCATION', amount:-110000000, days:-30, projectKey:'prj-3', note:'Lot 3 earthworks funding', actor:'Tendai Muchengeti' },
    ]},
    { clientKey:'cli-4', steps:[
      { kind:'TOPUP', amount:75000000, days:-18, reference:'RTGS-2026-1077', method:'Bank transfer (USD)', note:'Retention release held on account', actor:'Farai Nyamayaro' },
    ]},
    { clientKey:'cli-6', steps:[
      { kind:'TOPUP', amount:150000000, days:-25, reference:'RTGS-2026-1019', method:'Bank transfer (USD)', note:'Capex reserve – unallocated', actor:'Farai Nyamayaro' },
    ]},
    { clientKey:'cli-9', steps:[
      { kind:'TOPUP', amount:200000000, days:-12, reference:'RTGS-2026-1102', method:'Bank transfer (USD)', note:'Graniteside pre-construction deposit', actor:'Farai Nyamayaro' },
      { kind:'ALLOCATION', amount:-90000000, days:-5, projectKey:'prj-5', note:'Design & pre-construction funding', actor:'Lisa Goromonzi' },
    ]},
  ];
  const balances = new Map<string, number>();
  for (const seedWallet of walletSeeds) {
    const clientId = client(seedWallet.clientKey);
    const rec = await prisma.record.findFirst({ where: { id: clientId, organizationId: orgId, resource:'clients', deletedAt:null }, select:{id:true} });
    if (!rec) continue;
    const w = await prisma.wallet.create({ data: { organizationId: orgId, clientId, currency:'USD', balanceCents:0 } });
    let balance = 0;
    let pendingReversalOf: string | null = null;
    for (const step of seedWallet.steps) {
      balance += step.amount;
      const t: any = await prisma.walletTransaction.create({ data: {
        organizationId: orgId, walletId: w.id, clientId,
        projectId: step.projectKey ? project(step.projectKey) : null,
        kind: step.kind, amountCents: step.amount, balanceCents: balance, currency:'USD',
        reference: step.reference || null, method: step.method || null, note: step.note || null,
        actorName: step.actor || 'Farai Nyamayaro', reversesId: step.kind === 'REVERSAL' ? pendingReversalOf : null,
        createdAt: at(step.days),
      }});
      if (step.note?.includes('Duplicate allocation')) pendingReversalOf = t.id;
      if (step.kind === 'REVERSAL' && pendingReversalOf) {
        await prisma.walletTransaction.update({ where: { id: pendingReversalOf }, data: { reversedAt: at(step.days) } });
        pendingReversalOf = null;
      }
    }
    await prisma.wallet.update({ where: { id: w.id }, data: { balanceCents: balance } });
    balances.set(clientId, balance / 100);
  }
  // Mirror balances onto the client register and funding onto the project register.
  const allClients = await prisma.record.findMany({ where: { organizationId: orgId, resource:'clients', deletedAt:null } });
  for (const c of allClients) {
    let d:any = {}; try { d = JSON.parse(c.data || '{}'); } catch {}
    d.walletBalance = balances.get(c.id) || 0;
    await prisma.record.update({ where: { id: c.id }, data: { data: JSON.stringify(d) } });
  }
  const allProjects = await prisma.record.findMany({ where: { organizationId: orgId, resource:'projects', deletedAt:null } });
  for (const pr of allProjects) {
    const agg = await prisma.walletTransaction.aggregate({ where: { organizationId: orgId, projectId: pr.id, kind:'ALLOCATION', reversedAt:null }, _sum:{ amountCents:true } });
    const funded = -(agg._sum.amountCents || 0) / 100;
    let d:any = {}; try { d = JSON.parse(pr.data || '{}'); } catch {}
    const target = Number(d.contractValue ?? d.budget ?? 0) || 0;
    d.fundedAmount = funded;
    d.remainingToFund = Math.max(0, target - funded);
    await prisma.record.update({ where: { id: pr.id }, data: { data: JSON.stringify(d) } });
  }
  return { records: demo.records.length, wallets: walletSeeds.length };
}
