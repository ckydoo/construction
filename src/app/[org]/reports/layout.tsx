import type { ReactNode } from 'react';
import { requirePageModule } from '@/lib/page-modules';

export default async function ReportsLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  await requirePageModule(org, { moduleId: 'reports' });
  return <>{children}</>;
}
