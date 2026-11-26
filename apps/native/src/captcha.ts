import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { origin } from './client';
import { CAPTCHA_RETURN_URL, readCaptchaReturn } from './captcha-protocol';

export async function completeCaptcha(): Promise<string> {
  const state = Crypto.randomUUID();
  // Only the nonce travels to the website. Passwords and session tokens stay native.
  const result = await WebBrowser.openAuthSessionAsync(
    `${origin}/auth/mobile-captcha?${new URLSearchParams({state})}`,
    CAPTCHA_RETURN_URL,
  );
  if (result.type !== 'success') throw new Error('Security check cancelled. Tap Sign in to try again.');
  return readCaptchaReturn(result.url, state);
}
