import type { ReactNode } from 'react';
import { requireOrg } from '@/lib/auth';

/* Support is deliberately not tied to a catalogue module: every member must be
 * able to report a bug without changing starter section/resource counts. */
export default async function SupportLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  await requireOrg(org);
  return <>{children}</>;
}
