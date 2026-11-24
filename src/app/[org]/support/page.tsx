import Link from 'next/link';
import SupportDesk from '@/components/SupportDesk';
import { Icon } from '@/components/ui';

export default async function SupportPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <div className="space-y-4">
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div><h2 className="text-sm font-semibold">Documentation</h2><p className="mt-1 text-xs muted">Read the guides for using MYLA.</p></div>
      <Link href={`/${org}/documentation`} data-testid="support-documentation" className="btn-outline btn-sm inline-flex items-center gap-2"><Icon name="BookOpen" size={16}/>Open documentation</Link>
    </div>
    <SupportDesk org={org}/>
  </div>;
}
