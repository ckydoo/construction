import { NextResponse } from 'next/server';
import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import prisma from '@/lib/db';
import { apiAuth } from '@/lib/auth';
import { canDelete, isExternal } from '@/lib/catalog';
import { uploadDir } from '@/lib/files';
import { logActivity } from '@/lib/records';
import { guardResource } from '@/lib/guard';

export async function GET(_req:Request,{params}:{params:Promise<{org:string;id:string}>}){
  const { org,id } = await params;
  const a = await apiAuth(org); if(!a) return NextResponse.json({error:'Unauthorized'},{status:401});
  const att = await prisma.attachment.findFirst({where:{id,organizationId:a.orgId}});
  if(!att) return NextResponse.json({error:'File not found'},{status:404});
  const g = guardResource(a.config, att.resource); if (g) return g;
  try{
    const buf = await readFile(path.join(uploadDir(a.orgId),path.basename(att.storedName)));
    return new NextResponse(new Uint8Array(buf),{headers:{
      'Content-Type':att.mime,
      'Content-Disposition':`inline; filename="${att.fileName.replace(/"/g,'')}"`,
      'Cache-Control':'private, max-age=3600',
    }});
  }catch{ return NextResponse.json({error:'File missing on disk'},{status:404}); }
}
export async function DELETE(_req:Request,{params}:{params:Promise<{org:string;id:string}>}){
  const { org,id } = await params;
  const a = await apiAuth(org); if(!a) return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!canDelete(a.role)||isExternal(a.role)) return NextResponse.json({error:'Your role cannot delete files'},{status:403});
  const att = await prisma.attachment.findFirst({where:{id,organizationId:a.orgId}});
  if(!att) return NextResponse.json({error:'File not found'},{status:404});
  const g = guardResource(a.config, att.resource); if (g) return g;
  try{ await unlink(path.join(uploadDir(a.orgId),path.basename(att.storedName))); }catch{}
  await prisma.attachment.delete({where:{id}});
  if(att.isLatest && att.documentKey){
    const next = await prisma.attachment.findFirst({where:{organizationId:a.orgId,documentKey:att.documentKey},orderBy:{revision:'desc'}});
    if(next) await prisma.attachment.update({where:{id:next.id},data:{isLatest:true}});
  }
  await logActivity(a.orgId,a.userId,a.name,'DELETE',att.resource,`Removed attachment “${att.fileName}”`);
  return NextResponse.json({ok:true});
}
