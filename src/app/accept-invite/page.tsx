'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {apiSend} from '@/lib/client';
import {userMessage} from '@/lib/user-message';
import {Button,Card,CardHead,Field} from '@/components/ui';
import TurnstileChallenge from '@/components/TurnstileChallenge';

export default function AcceptInvitePage(){
  const [token,setToken]=useState(''); const [info,setInfo]=useState<any>(null); const [error,setError]=useState('');
  const [password,setPassword]=useState(''); const [repeat,setRepeat]=useState(''); const [captcha,setCaptcha]=useState(''); const [attempt,setAttempt]=useState(0); const [busy,setBusy]=useState(false);const [done,setDone]=useState(false);
  useEffect(()=>{const t=new URLSearchParams(location.search).get('token')||'';setToken(t);if(!t){setError('Invitation link is incomplete.');return;} apiSend('/api/auth/workspace-invite','POST',{action:'info',token:t}).then(setInfo).catch((e:any)=>setError(userMessage(e,'Invitation unavailable.')));},[]);
  async function accept(e:React.FormEvent){e.preventDefault();setError('');if(info.newAccount && password!==repeat){setError('Passwords do not match.');return;}if(!info.newAccount && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !captcha){setError('Complete the security check.');return;}setBusy(true);try{await apiSend('/api/auth/workspace-invite','POST',{action:'accept',token,password,captchaToken:captcha});setDone(true);}catch(e:any){setError(userMessage(e,'Could not accept the invitation.'));setCaptcha('');setAttempt(n=>n+1);}finally{setBusy(false);}}
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5"><div className="w-full max-w-md"><Card><CardHead title="Accept your invitation" subtitle={info?`Join ${info.workspace} as ${info.email}`:'Checking invitation…'}/><div className="space-y-4 p-5">
    {done?<><p className="text-sm">Invitation accepted. You can now sign in to MYLA.</p><Link href="/login" className="text-brand-700 underline">Go to sign in</Link></>:info&&<form onSubmit={accept} className="space-y-4"><p className="text-xs muted">{info.newAccount?'Choose a password for your new account.':'Sign in with your existing MYLA password to accept.'}</p><Field label={info.newAccount?'Choose password':'Your MYLA password'} required><input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={info.newAccount?8:1} required/></Field>{info.newAccount&&<Field label="Repeat password" required><input className="input" type="password" value={repeat} onChange={e=>setRepeat(e.target.value)} minLength={8} required/></Field>}{!info.newAccount&&process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY&&<TurnstileChallenge key={attempt} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} onToken={setCaptcha} onError={()=>setError('Security check could not load. Refresh and try again.')}/>}<Button type="submit" variant="primary" loading={busy}>Accept invitation</Button></form>}
    {error&&<p className="text-sm text-red-700" role="alert">{error}</p>}
  </div></Card></div></div>;
}
