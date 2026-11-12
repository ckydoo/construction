'use client';
import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import ResourceTable from '@/components/ResourceTable';
import { Skeleton } from '@/components/ui';
function Inner(){
  const {org,resource}=useParams<{org:string;resource:string}>();
  const sp=useSearchParams();
  return <ResourceTable org={org} resource={resource} initialOpenId={sp.get('open')} initialNew={sp.get('new')==='1'} initialProjectId={sp.get('project') || undefined}/>;
}
export default function Page(){ return <Suspense fallback={<div className="space-y-4"><Skeleton className="h-12 w-1/3"/><Skeleton className="h-96"/></div>}><Inner/></Suspense>; }
