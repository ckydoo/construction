# Native sign-in CAPTCHA

MYLA Everyday now opens the system browser at `EXPO_PUBLIC_API_URL/auth/mobile-captcha` before each password sign-in. The user completes the existing Cloudflare Turnstile challenge and taps Return to MYLA Everyday. The app receives only a short-lived CAPTCHA token, bound to a random per-attempt nonce, at `myla://captcha`. It passes that token as Supabase's `options.captchaToken`.

Passwords, email addresses and Supabase sessions are never included in browser/deep-link URLs. Supabase verifies the CAPTCHA; the app does not validate CAPTCHA tokens itself or bypass protection. Each retry starts a fresh challenge. Cancellation/failed verification stops password submission. The challenge page clears expired tokens and offers retry. No token is persisted. The fixed return scheme prevents user-supplied redirect destinations.

## Deployment prerequisites

1. Deploy the web page and MobileCaptcha component together with `apps/native/src/captcha-protocol.ts` (shared pure protocol). This page is public under the existing reserved `/auth` path, not behind org authentication/billing.
2. The web build needs `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, using the widget paired with Supabase's configured CAPTCHA secret. Cloudflare Turnstile must allow the exact hostname of `EXPO_PUBLIC_API_URL` (normally app.myla.co.zw). Do not disable Supabase CAPTCHA.
3. Build a new standalone preview APK from the branch containing this change. expo-web-browser is a new native dependency; an old APK cannot gain this flow just by redeploying the website. Use the same Android signing key. No new CAPTCHA secret or public key is needed in the APK.
4. Install the APK, sign in, complete the browser check, and tap Return to MYLA Everyday. Allow opening the app if prompted. Supabase redirect URL configuration is not used for this CAPTCHA-only callback; it returns no authentication session. The app's existing `myla` scheme handles it.

Checks passed locally: callback URL validation, nonce mismatch/replay-context rejection, missing/oversized/duplicate token rejection, sign-in token wiring, native typecheck, Android JS export, autolinking tests and web build. An actual CAPTCHA token replay is rejected by Supabase, not by our parser.

Still required on a real Android device: successful challenge/sign-in, wrong password with a fresh challenge on retry, browser cancellation, expired token, offline/error recovery, duplicate taps, and return-to-app with the installed APK. Expo Go is not the acceptance target for the custom scheme. Do not claim real-device verification from bundling tests.

This does not fix local-preview Supabase placeholder configuration. Web browser login continues to use its existing Turnstile integration.
