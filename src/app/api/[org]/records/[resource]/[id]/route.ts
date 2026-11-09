import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { apiAuth } from '@/lib/auth';
import { getResource } from '@/lib/resources';
import { canWrite, canDelete } from '@/lib/catalog';
import { getRecord, updateRecord, deleteRecord } from '@/lib/records';
import { guardResource } from '@/lib/guard';
type Ctx = { params: Promise<{org:string;resource:string;id:string}> };
export async function GET(_req:Request,{params}:Ctx){
  const { org, resource, id } = await params;
  const a = await apiAuth(org); const def = getResource(resource);
  if (!a||!def) return NextResponse.json({error:'Unauthorized'},{status:401});
  const g = guardResource(a.config, resource); if (g) return g;
  const row = await getRecord(a.orgId, resource, id);
  if (!row) return NextResponse.json({error:'Not found'},{status:404});
  const [comments,files] = await Promise.all([
    prisma.comment.findMany({where:{recordId:id,organizationId:a.orgId},orderBy:{createdAt:'asc'}}),
    prisma.attachment.findMany({where:{recordId:id,organizationId:a.orgId},orderBy:{createdAt:'desc'}}),
  ]);
  return NextResponse.json({ row, comments, files });
}
export async function PATCH(req:Request,{params}:Ctx){
  const { org, resource, id } = await params;
  const a = await apiAuth(org); const def = getResource(resource);
  if (!a||!def) return NextResponse.json({error:'Unauthorized'},{status:401});
  const g = guardResource(a.config, resource); if (g) return g;
  if (!canWrite(a.role, resource)) return NextResponse.json({error:'Your role cannot edit records here'},{status:403});
  const body = await req.json();
  const result = await updateRecord(a.orgId,a.userId,a.name,def,id,body);
  if (!result.ok) return NextResponse.json({error:'Validation failed',errors:result.errors},{status:400});
  return NextResponse.json({row:result.row});
}
export async function DELETE(_req:Request,{params}:Ctx){
  const { org, resource, id } = await params;
  const a = await apiAuth(org); const def = getResource(resource);
  if (!a||!def) return NextResponse.json({error:'Unauthorized'},{status:401});
  const g = guardResource(a.config, resource); if (g) return g;
  if (!canDelete(a.role)) return NextResponse.json({error:'Your role cannot delete records'},{status:403});
  const result = await deleteRecord(a.orgId,a.userId,a.name,def,id);
  if (!result.ok) return NextResponse.json({error:result.error},{status:404});
  return NextResponse.json({ok:true});
}
