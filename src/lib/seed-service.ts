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
  return { records: demo.records.length };
}
