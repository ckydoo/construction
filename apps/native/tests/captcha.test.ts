import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {URL as NodeURL} from 'node:url';
import {captchaReturnUrl,readCaptchaReturn,validCaptchaState} from '../src/captcha-protocol';
const state='b14316b7-b740-47a6-8319-a0bd6ff0e129';
assert.ok(validCaptchaState(state));
assert.equal(readCaptchaReturn(captchaReturnUrl(state,'single-use-token'),state),'single-use-token');
for(const raw of [
 'https://evil.example/captcha?state='+state+'&token=x',
 'myla://other?state='+state+'&token=x',
 'myla://captcha/path?state='+state+'&token=x',
 'myla://user:pass@captcha?state='+state+'&token=x',
 'myla://captcha?state='+state+'&state='+state+'&token=x',
 'myla://captcha?state='+state+'&token=x&token=y',
 'myla://captcha?state='+state+'&token=x#fragment',
 'myla://captcha?state='+state+'&token=',
 'myla://captcha?state=wrong&token=x',
])assert.throws(()=>readCaptchaReturn(raw,state));
assert.throws(()=>captchaReturnUrl('bad-state','token'));
assert.throws(()=>captchaReturnUrl(state,'a'.repeat(2049)));
assert.throws(()=>readCaptchaReturn(captchaReturnUrl(state,'token'),'b14316b7-b740-47a6-8319-a0bd6ff0e120'));
const app=readFileSync(new NodeURL('../src/App.tsx',import.meta.url),'utf8');
const login=app.slice(app.indexOf('function Login()'),app.indexOf('function MainTabs()'));
assert.match(login,/await completeCaptcha\(\)/);
assert.match(login,/options:\s*\{\s*captchaToken\s*\}/);
assert.ok(login.indexOf('await completeCaptcha()')<login.indexOf('auth.signInWithPassword'));
console.log('CAPTCHA return URL, nonce binding, token validation and native sign-in wiring checks passed.');
