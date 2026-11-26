# Native sign-in CAPTCHA

## In-app first; browser fallback

MYLA Everyday opens a native Security check modal containing a **small WebView only for CAPTCHA**. The rest of the application stays native. It loads `EXPO_PUBLIC_API_URL/auth/mobile-captcha?state=<nonce>&embedded=1` over HTTPS. The page runs the existing Cloudflare Turnstile widget and posts the resulting one-time token to the native bridge. The modal closes automatically and the native form submits the password with Supabase's `options.captchaToken`.

The modal provides cancellation, error recovery, a two-minute wait warning, and an explicit **Use browser instead** fallback. Fallback uses the original system-browser flow, a fresh independent nonce, and the fixed `myla://captcha` callback. There is no automatic browser launch or CAPTCHA bypass.

Passwords, email addresses and Supabase sessions never enter the WebView, browser URLs or injected scripts. Only a short-lived CAPTCHA token is returned. No CAPTCHA token is persisted. Supabase validates/rejects used or expired tokens; bridge validation is not a substitute for that.

## Boundary checks

- Each login/retry gets a random UUID nonce. Only one request is pending at a time.
- Native messages must originate from the exact HTTPS challenge page URL, match the active nonce, have the expected message type, and contain a bounded nonempty token.
- Top-level WebView navigation is limited to that challenge URL; Cloudflare challenge URLs are allowed only for explicitly marked subframes. External schemes, unexpected paths, redirects and new windows are blocked. These checks govern navigation, not every subresource request.
- File access, mixed HTTP content, cross-file access, automatic windows, shared app cookies and caching are disabled. DOM storage and third-party cookies are available for the challenge provider in the isolated WebView.
- Browser fallback ignores pending embedded messages. Cancellation/unmount discards the pending attempt; late callback results cannot submit credentials. The email/password fields are disabled during the attempt.
- The page retains the non-embedded browser callback for older APKs and fallback. Embedded success never navigates to a custom scheme.

## Deployment prerequisites

1. Deploy the web page and MobileCaptcha component together with `apps/native/src/captcha-protocol.ts` (shared pure protocol). The page is public under the existing reserved `/auth` path, not behind org authentication/billing. Deploy this **before** distributing the new APK.
2. The web build needs `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, using the widget paired with Supabase's configured CAPTCHA secret. Cloudflare Turnstile must allow the exact hostname of `EXPO_PUBLIC_API_URL` (normally app.myla.co.zw). Do not disable Supabase CAPTCHA.
3. Build a new standalone preview APK. `react-native-webview` 13.15.0 is pinned to Expo SDK54's bundled recommendation. The existing `expo-web-browser` dependency handles fallback. An old APK cannot gain this flow from a web deployment. Use the same Android signing key. No new CAPTCHA secret or public key is needed in the APK.
4. Install the APK, sign in and complete the in-app check. It should close automatically. If the widget cannot run in that device's WebView, choose the browser fallback. Supabase auth redirect URL configuration is not used for this CAPTCHA-only callback; it returns no authentication session.

## Validation / limitations

Local checks passed: callback and bridge parser tests, nonce mismatch, empty/oversized tokens, unexpected navigation, untrusted origins, duplicate URL parameters, sign-in token/modal wiring, native TypeScript, Android JS export, autolinking/pipeline tests and web TypeScript/build.

No real Android CAPTCHA/session test or cloud Gradle APK compilation was performed for this change. Turnstile may challenge or reject some embedded browsers; the browser fallback is deliberately retained. Exact Cloudflare host configuration and the Supabase CAPTCHA key pairing still need live verification.

Real-device acceptance: successful automatic close/sign-in; cold/warm starts; wrong password followed by fresh verification; cancellation/Android Back; expired token; offline/error recovery; retry with stale messages; double taps; browser fallback success/cancellation; and accessible large-font/small-screen layouts. Expo Go is not the acceptance target for custom-scheme fallback.

This does not fix local-preview Supabase placeholder configuration. Web browser login continues to use its existing Turnstile integration. Existing SecureStore sessions remain unchanged, so normal session restoration does not invoke a fresh CAPTCHA.
