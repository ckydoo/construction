import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';
export default async function Home(){
  const a = await getAuth();
  if(!a) redirect('/login');
  if(!a.onboarded) redirect('/onboarding');
  redirect(`/${a.orgSlug}/dashboard`);
}
