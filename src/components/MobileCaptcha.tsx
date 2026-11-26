'use client';
import {useEffect,useRef,useState} from 'react';
import TurnstileChallenge from './TurnstileChallenge';
import {captchaReturnUrl,validCaptchaState} from '../../apps/native/src/captcha-protocol';
declare global {interface Window {ReactNativeWebView?:{postMessage:(message:string)=>void}}}
export default function MobileCaptcha({state,siteKey,embedded=false}:{state:string;siteKey:string;embedded?:boolean}){
  const [token,setToken]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const sent=useRef('');
  const valid=validCaptchaState(state);
  useEffect(()=>{
    if(!embedded||!valid)return;
    if(!siteKey||error){window.ReactNativeWebView?.postMessage(JSON.stringify({type:'myla-captcha-error',state}));return;}
    if(token&&sent.current!==token&&window.ReactNativeWebView){
      sent.current=token;
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'myla-captcha',state,token}));
    }
  },[token,error,embedded,valid,state,siteKey]);
  if(!valid)return <p role="alert">This verification link is invalid. Return to MYLA Everyday and tap Sign in again.</p>;
  if(!siteKey)return <p role="alert">Mobile verification is not configured yet. Ask your administrator to configure the website’s Turnstile site key. Return to the app and cancel this attempt.</p>;
  return <div className="space-y-5">
    <h1 className="text-2xl font-semibold">Verify your sign-in</h1>
    <p className="text-sm muted">{embedded?'Complete the security check. Sign-in will continue automatically.':'Complete the security check, then return to MYLA Everyday.'} Your password is not sent to this page.</p>
    <TurnstileChallenge key={attempt} siteKey={siteKey} onToken={t=>{setToken(t);if(t)setError('');}} onError={()=>{setToken('');setError('The security check could not load. Check your connection and try again.');}}/>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {token?(embedded?<p role="status" className="text-sm">Verified. Continuing sign-in…</p>:<a className="btn-primary inline-flex" href={captchaReturnUrl(state,token)}>Return to MYLA Everyday</a>):<p className="text-sm muted">Waiting for a successful security check…</p>}
    <button type="button" className="btn-outline block" onClick={()=>{sent.current='';setToken('');setError('');setAttempt(n=>n+1);}}>Restart security check</button>
    <p className="text-xs muted">{embedded?'If this screen gets stuck, use the app’s retry or browser option.':'If your browser asks to open MYLA Everyday, allow it.'} If verification expires or sign-in fails, start a new check from the app.</p>
  </div>;
}
