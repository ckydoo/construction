import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import AuthScreen from '@/components/AuthScreen';
export default async function LoginPage(){
  const a = await getAuth();
  if(a) redirect(a.onboarded?`/${a.orgSlug}/dashboard`:'/onboarding');
  return <AuthScreen/>;
}
