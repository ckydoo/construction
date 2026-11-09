import { chromium } from 'playwright';
import fs from 'node:fs';
const B='http://127.0.0.1:3000';
const dir='/home/user/buildops/screenshots/design-before';
fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await ctx.newPage();
await page.goto(B+'/login',{waitUntil:'networkidle'});
await page.locator('form').getByRole('button',{name:/Sign in/i}).click();
await page.waitForURL('**/dashboard',{timeout:20000});
await page.waitForTimeout(2500);
const shots=[
  ['dashboard', '/kestrel-ridge/dashboard'],
  ['clients', '/kestrel-ridge/m/clients'],
  ['projects', '/kestrel-ridge/m/projects'],
  ['reports', '/kestrel-ridge/reports'],
  ['settings', '/kestrel-ridge/settings'],
  ['wallets', '/kestrel-ridge/wallets'],
];
for(const [name,path] of shots){
  await page.goto(B+path,{waitUntil:'networkidle'});
  await page.waitForTimeout(1800);
  await page.screenshot({path:`${dir}/${name}.png`});
  console.log('shot',name);
}
// detail drawer on clients
await page.goto(B+'/kestrel-ridge/m/clients',{waitUntil:'networkidle'});
await page.waitForTimeout(1500);
const row=page.locator('tbody tr').first();
await row.locator('td').nth(1).click();
await page.waitForTimeout(1500);
await page.screenshot({path:`${dir}/detail-drawer.png`});
console.log('shot detail-drawer');
// login mobile
await page.setViewportSize({width:390,height:844});
await page.goto(B+'/login',{waitUntil:'networkidle'});
await page.screenshot({path:`${dir}/login-mobile.png`});
console.log('shot login-mobile');
await browser.close();
