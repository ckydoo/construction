import type { ReactNode } from 'react';
import { requirePageModule } from '@/lib/page-modules';

export default async function ResourceLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string; resource: string }> }) {
  const { org, resource } = await params;
  await requirePageModule(org, { resourceId: resource });
  return <>{children}</>;
}
