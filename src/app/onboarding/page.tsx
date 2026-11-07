import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import OnboardingWizard from '@/components/OnboardingWizard';
export default async function Page(){
  const a = await getAuth();
  if(!a) redirect('/login');
  if(a.onboarded) redirect(`/${a.orgSlug}/dashboard`);
  return <OnboardingWizard initialName={a.orgName} userName={a.name}/>;
}
