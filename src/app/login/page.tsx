import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import { hasSupabaseConfig } from '@/lib/supabase';
import AuthScreen from '@/components/AuthScreen';
export const dynamic = 'force-dynamic';
export default async function LoginPage(){
  const configured = hasSupabaseConfig();
  if (configured) {
    const a = await getAuth();
    if(a) redirect(a.onboarded?`/${a.orgSlug}/dashboard`:'/onboarding');
  }
  return <AuthScreen configured={configured}/>;
}
