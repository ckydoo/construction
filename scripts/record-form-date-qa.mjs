import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const root=process.cwd(), dir=await mkdtemp(path.join(tmpdir(),'record-form-qa-'));
let server,browser;
try {
  await build({entryPoints:[path.join(root,'scripts/record-form-date-harness.tsx')],bundle:true,platform:'browser',format:'iife',jsx:'automatic',outfile:path.join(dir,'bundle.js'),alias:{'@':path.join(root,'src'),'react':path.join(root,'node_modules/react'),'react-dom':path.join(root,'node_modules/react-dom'),'@tanstack/react-query':path.join(root,'node_modules/@tanstack/react-query')}});
  const bundle=await readFile(path.join(dir,'bundle.js'));
  server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?bundle:'<html><body><div id="root"></div><script src="/bundle.js"></script></body></html>')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true});const p=await browser.newPage();
  await p.goto(`http://127.0.0.1:${server.address().port}`);
  const date=p.locator('input[type=date]');await date.fill('2026-11-12');await p.getByPlaceholder('Enter name').fill('Work');
  await p.getByRole('button',{name:'Update settings'}).click({force:true});
  assert.equal(await date.inputValue(),'2026-11-12','date lost after settings refresh');
  assert.equal(await p.getByPlaceholder('Enter name').inputValue(),'Work','name lost after settings refresh');
  await p.getByRole('button',{name:'Cancel'}).click();await p.getByRole('button',{name:'Reopen'}).click();
  assert.equal(await date.inputValue(),'');
  assert.equal(await p.locator('input[type=number]').inputValue(),'15','new form uses current tax default');
  console.log('PASS: edits survive settings refresh; reopening initializes fresh values and current tax default (mocked browser).');
} finally {if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
