import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { apiAuth } from '@/lib/auth';
import { guardResource } from '@/lib/guard';

export async function POST(req:Request,{params}:{params:Promise<{org:string;resource:string;id:string}>}){
  const { org, resource, id } = await params;
  const a = await apiAuth(org); if(!a) return NextResponse.json({error:'Unauthorized'},{status:401});
  const g = guardResource(a.config, resource); if (g) return g;
  // The comment must belong to a live record of this org and the same resource.
  const rec = await prisma.record.findFirst({ where:{ id, organizationId:a.orgId, resource, deletedAt:null }, select:{id:true} });
  if(!rec) return NextResponse.json({error:'Record not found'},{status:404});
  const { body } = await req.json();
  if(!String(body||'').trim()) return NextResponse.json({error:'Comment cannot be empty'},{status:400});
  const c = await prisma.comment.create({data:{organizationId:a.orgId,recordId:id,authorId:a.userId,authorName:a.name,body:String(body).trim()}});
  return NextResponse.json({comment:c},{status:201});
}
