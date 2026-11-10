import type { ReactNode } from 'react';
import { requirePageModule } from '@/lib/page-modules';

export default async function DashboardLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  await requirePageModule(org, { moduleId: 'dashboard' });
  return <>{children}</>;
}
