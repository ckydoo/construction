'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

export default function TurnstileChallenge({ siteKey, onToken, onError }: {
  siteKey: string; onToken: (token: string) => void; onError: () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onToken, onError });
  callbacks.current = { onToken, onError };
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready || !element.current || !window.turnstile) return;
    const api = window.turnstile;
    const id = api.render(element.current, {
      sitekey: siteKey,
      callback: (token: string) => callbacks.current.onToken(token),
      'expired-callback': () => callbacks.current.onToken(''),
      'error-callback': () => { callbacks.current.onToken(''); callbacks.current.onError(); },
    });
    return () => { api.remove(id); callbacks.current.onToken(''); };
  }, [ready, siteKey]);
  return <>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => setReady(true)} onError={() => onError()}/>
    <div ref={element} aria-label="Security verification" />
  </>;
}
