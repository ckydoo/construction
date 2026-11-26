import type {Metadata} from 'next';
import MobileCaptcha from '@/components/MobileCaptcha';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'MYLA — Verify sign-in',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function MobileCaptchaPage({searchParams}:{searchParams:Promise<{state?:string|string[];embedded?:string|string[]}>}){
  const params=await searchParams;
  return <main className="mx-auto min-h-screen max-w-lg px-5 py-12"><MobileCaptcha embedded={params.embedded==='1'} state={typeof params.state==='string'?params.state:''} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY||''}/></main>;
}
