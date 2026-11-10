import type { ReactNode } from 'react';
import { requirePageModule } from '@/lib/page-modules';

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string; id: string }> }) {
  const { org } = await params;
  await requirePageModule(org, { resourceId: 'projects' });
  return <>{children}</>;
}
