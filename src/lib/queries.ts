import prisma from './db';

export async function rowsFor(orgId:string, resource:string): Promise<Record<string,any>[]> {
  const recs = await prisma.record.findMany({ where:{ organizationId:orgId, resource, deletedAt:null }, orderBy:{createdAt:'desc'}, take:1000 });
  return recs.map(r => {
    let d:any={}; try { d=JSON.parse(r.data||'{}'); } catch {}
    return { ...d, id:r.id, number:r.number, title:r.title, status:r.status, projectId:r.projectId, createdAt:r.createdAt.toISOString() };
  });
}
export async function countsByResource(orgId:string): Promise<Record<string,number>> {
  const groups = await prisma.record.groupBy({ by:['resource'], where:{organizationId:orgId, deletedAt:null}, _count:{_all:true} });
  return Object.fromEntries(groups.map(g=>[g.resource,g._count._all]));
}
export const sum = (rows:any[], key:string) => rows.reduce((t,r)=>t+(Number(r[key])||0),0);
