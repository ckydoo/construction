import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import prisma from '@/lib/db';
import { apiAuth } from '@/lib/auth';
import { getResource } from '@/lib/resources';
import { canWrite } from '@/lib/catalog';
import { logActivity } from '@/lib/records';
import { MAX_FILE_BYTES, uploadDir, revisionLabel } from '@/lib/files';

export async function POST(req:Request,{params}:{params:Promise<{org:string}>}){
  const { org } = await params;
  const a = await apiAuth(org); if(!a) return NextResponse.json({error:'Unauthorized'},{status:401});
  let form:FormData;
  try{ form = await req.formData(); }catch{ return NextResponse.json({error:'Expected multipart form data'},{status:400}); }
  const file = form.get('file');
  const recordId = String(form.get('recordId')||'');
  const resource = String(form.get('resource')||'');
  const supersedesId = String(form.get('supersedesId')||'');
  const note = String(form.get('note')||'').slice(0,500);
  if(!(file instanceof File) || !recordId || !resource) return NextResponse.json({error:'file, recordId and resource are required'},{status:400});
  const def = getResource(resource);
  if(!def || !a.config.resources.includes(resource)) return NextResponse.json({error:'Unknown or disabled resource'},{status:404});
  if(!canWrite(a.role,resource)) return NextResponse.json({error:'Your role cannot upload files here'},{status:403});
  if(file.size > MAX_FILE_BYTES) return NextResponse.json({error:'File is larger than 12 MB'},{status:413});
  const rec = await prisma.record.findFirst({where:{id:recordId,organizationId:a.orgId,resource,deletedAt:null}});
  if(!rec) return NextResponse.json({error:'Record not found'},{status:404});

  let documentKey:string = randomUUID(), revision = 1;
  if(supersedesId){
    const parent = await prisma.attachment.findFirst({where:{id:supersedesId,organizationId:a.orgId,recordId}});
    if(!parent) return NextResponse.json({error:'Parent attachment not found'},{status:404});
    documentKey = parent.documentKey || parent.id;
    if(!parent.documentKey) await prisma.attachment.update({where:{id:parent.id},data:{documentKey}});
    const siblings = await prisma.attachment.findMany({where:{organizationId:a.orgId,documentKey}});
    revision = Math.max(0,...siblings.map((s:any)=>s.revision||1)) + 1;
    await prisma.attachment.updateMany({where:{organizationId:a.orgId,documentKey},data:{isLatest:false}});
  }

  const safe = path.basename(file.name).replace(/[^a-zA-Z0-9._()\- ]/g,'_').slice(0,160) || 'file';
  const storedName = `${randomUUID()}-${safe}`;
  const dir = uploadDir(a.orgId);
  await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,storedName),Buffer.from(await file.arrayBuffer()));
  const att = await prisma.attachment.create({data:{
    organizationId:a.orgId, recordId, resource, fileName:safe, storedName,
    mime:file.type||'application/octet-stream', size:file.size,
    uploadedById:a.userId, uploadedByName:a.name,
    documentKey, revision, revisionLabel:revisionLabel(revision), isLatest:true, note:note||null,
  }});
  await logActivity(a.orgId,a.userId,a.name,'UPLOAD',resource,
    revision>1?`Uploaded ${revisionLabel(revision)} of “${safe}” on ${rec.title||rec.number}`:`Attached “${safe}” to ${rec.title||rec.number}`);
  return NextResponse.json({attachment:att},{status:201});
}

export async function GET(req:Request,{params}:{params:Promise<{org:string}>}){
  const { org } = await params;
  const a = await apiAuth(org); if(!a) return NextResponse.json({error:'Unauthorized'},{status:401});
  const u = new URL(req.url);
  const recordId = u.searchParams.get('recordId')||'';
  const resource = u.searchParams.get('resource')||'';
  const where:any = {organizationId:a.orgId};
  if(recordId) where.recordId = recordId;
  if(resource) where.resource = resource;
  const files = await prisma.attachment.findMany({where,orderBy:{createdAt:'desc'},take:200});
  return NextResponse.json({files});
}
