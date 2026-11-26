import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {URL as NodeURL} from 'node:url';
import {captchaReturnUrl,readCaptchaReturn,validCaptchaState,embeddedCaptchaUrl,isCaptchaPage,allowCaptchaNavigation,readCaptchaMessage} from '../src/captcha-protocol';
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

const origin='https://app.myla.co.zw';
const page=embeddedCaptchaUrl(origin,state);
const message=JSON.stringify({type:'myla-captcha',state,token:'one-time-token'});
assert.deepEqual(readCaptchaMessage(message,page,origin,state),{token:'one-time-token'});
assert.deepEqual(readCaptchaMessage(JSON.stringify({type:'myla-captcha-error',state}),page,origin,state),{error:true});
assert.equal(isCaptchaPage(page,origin,state),true);
assert.equal(allowCaptchaNavigation(page,true,origin,state),true);
assert.equal(allowCaptchaNavigation('https://challenges.cloudflare.com/turnstile/iframe',false,origin,state),true);
assert.equal(allowCaptchaNavigation('https://challenges.cloudflare.com/turnstile/iframe',true,origin,state),false);
assert.equal(allowCaptchaNavigation('https://challenges.cloudflare.com/turnstile/iframe',undefined,origin,state),false);
for(const url of ['http://app.myla.co.zw/auth/mobile-captcha','https://evil.example/', 'https://app.myla.co.zw/login','javascript:alert(1)','file:///etc/passwd','myla://captcha',page+'#bad',page+'&state='+state]){
 assert.equal(allowCaptchaNavigation(url,true,origin,state),false);
 assert.throws(()=>readCaptchaMessage(message,url,origin,state));
}
for(const raw of ['not JSON','null',JSON.stringify({type:'myla-captcha',state:'wrong',token:'x'}),JSON.stringify({type:'myla-captcha',state,token:''}),JSON.stringify({type:'myla-captcha',state,token:'x'.repeat(2049)}),JSON.stringify({type:'other',state,token:'x'}),'x'.repeat(4097)])assert.throws(()=>readCaptchaMessage(raw,page,origin,state));
assert.throws(()=>embeddedCaptchaUrl('http://app.myla.co.zw',state));
assert.throws(()=>embeddedCaptchaUrl('https://user:pass@app.myla.co.zw',state));
assert.throws(()=>embeddedCaptchaUrl(origin,'wrong'));
assert.match(login,/useCaptcha\(\)/);
assert.match(login,/\{challenge\}/);
console.log('Embedded CAPTCHA origin, navigation, nonce, message and native modal wiring checks passed.');
