import { requireOrg } from '@/lib/auth';
import AppShell from '@/components/AppShell';
export default async function OrgLayout({children,params}:{children:React.ReactNode;params:Promise<{org:string}>}){
  const { org } = await params;
  const a = await requireOrg(org);
  return <AppShell orgSlug={org} userName={a.name} userEmail={a.email} role={a.role}>{children}</AppShell>;
}
