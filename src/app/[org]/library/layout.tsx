import type { ReactNode } from 'react';
import { requirePageModule } from '@/lib/page-modules';

export default async function LibraryLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  await requirePageModule(org, { resourceId: 'documents' });
  return <>{children}</>;
}
