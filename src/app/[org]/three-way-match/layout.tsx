import type { ReactNode } from 'react';
import { requirePageModule } from '@/lib/page-modules';

export default async function ThreeWayMatchLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  await requirePageModule(org, {
    moduleId: 'procurement', resourceId: 'purchaseOrders',
    also: { moduleId: 'finance', resourceId: 'apBills' },
  });
  return <>{children}</>;
}
