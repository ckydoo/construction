import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { apiAuth } from '@/lib/auth';
export async function POST(req:Request,{params}:{params:Promise<{org:string;id:string}>}){
  const { org, id } = await params;
  const a = await apiAuth(org); if(!a) return NextResponse.json({error:'Unauthorized'},{status:401});
  const { body } = await req.json();
  if(!String(body||'').trim()) return NextResponse.json({error:'Comment cannot be empty'},{status:400});
  const c = await prisma.comment.create({data:{organizationId:a.orgId,recordId:id,authorId:a.userId,authorName:a.name,body:String(body).trim()}});
  return NextResponse.json({comment:c},{status:201});
}
