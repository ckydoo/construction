import { notFound } from 'next/navigation';
import QuoteStudio from '@/components/QuoteStudio';
import { buildScope } from '@/lib/access';
import { getRecord } from '@/lib/records';
import { requirePageModule } from '@/lib/page-modules';

export default async function EditQuotePage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const a = await requirePageModule(org, { resourceId: 'estimates' });
  const scope = await buildScope(a);
  const row = await getRecord(a.orgId, 'estimates', id, scope);
  if (!row) notFound();
  return <QuoteStudio org={org} mode="edit" recordId={id} initialRow={row} />;
}
