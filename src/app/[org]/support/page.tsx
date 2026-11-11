import SupportDesk from '@/components/SupportDesk';

export default async function SupportPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <SupportDesk org={org}/>;
}
