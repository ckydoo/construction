// Shared by the native client and the hosted web challenge. Contains no secrets.
export const CAPTCHA_RETURN_URL = 'myla://captcha';
export const validCaptchaState = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function captchaReturnUrl(state: string, token: string): string {
  if (!validCaptchaState(state) || !token || token.length > 2048) throw new Error('Invalid verification response.');
  return `${CAPTCHA_RETURN_URL}?${new URLSearchParams({state,token})}`;
}
export function readCaptchaReturn(raw: string, expectedState: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Invalid security check response. Please try again.'); }
  if (url.protocol !== 'myla:' || url.hostname !== 'captcha' || !['','/'].includes(url.pathname) || url.port || url.username || url.password || url.hash || !validCaptchaState(expectedState) || url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== expectedState || url.searchParams.getAll('token').length !== 1) {
    throw new Error('Security check did not match this sign-in attempt. Please try again.');
  }
  const token = url.searchParams.get('token') || '';
  if (!token || token.length > 2048) throw new Error('Security check was not completed. Please try again.');
  return token;
}

export function embeddedCaptchaUrl(origin: string, state: string): string {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !validCaptchaState(state)) throw new Error('Invalid verification address.');
  return `${url.origin}/auth/mobile-captcha?${new URLSearchParams({state,embedded:'1'})}`;
}
export function isCaptchaPage(raw: string, origin: string, state: string): boolean {
  try { return new URL(raw).href === embeddedCaptchaUrl(origin,state); } catch { return false; }
}
export function allowCaptchaNavigation(raw: string, isTopFrame: boolean | undefined, origin: string, state: string): boolean {
  if (isCaptchaPage(raw,origin,state)) return true;
  // The widget uses a Cloudflare iframe, not a new top-level application page.
  try { const url=new URL(raw); return isTopFrame === false && url.origin==='https://challenges.cloudflare.com' && !url.username && !url.password; } catch { return false; }
}
export function readCaptchaMessage(raw: string, sourceUrl: string, origin: string, state: string): {token: string} | {error: true} {
  if (!isCaptchaPage(sourceUrl,origin,state) || raw.length>4096) throw new Error('Untrusted verification message.');
  const message=JSON.parse(raw);
  if (!message || message.state!==state || !validCaptchaState(state)) throw new Error('Security check does not match this attempt.');
  if (message.type==='myla-captcha-error') return {error:true};
  if (message.type!=='myla-captcha' || typeof message.token!=='string' || !message.token.trim() || message.token.length>2048) throw new Error('Invalid verification token.');
  return {token:message.token};
}
