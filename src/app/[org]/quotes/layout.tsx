import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { canWrite } from '@/lib/catalog';
import { requirePageModule } from '@/lib/page-modules';

export default async function QuotesLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await requirePageModule(org, { resourceId: 'estimates' });
  if (!canWrite(a.role, 'estimates')) notFound();
  return <>{children}</>;
}
