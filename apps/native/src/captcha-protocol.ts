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
