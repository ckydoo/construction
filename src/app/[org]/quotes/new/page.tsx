import QuoteStudio from '@/components/QuoteStudio';

export default async function NewQuotePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <QuoteStudio org={org} mode="create" />;
}
