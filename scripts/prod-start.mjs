/* One-shot boot for container deployments: ensure schema, optionally seed, then serve. */
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const run = (cmd,args,opts={}) => {
  const r = spawnSync(cmd,args,{stdio:'inherit',shell:process.platform==='win32',...opts});
  if(r.status!==0) process.exit(r.status??1);
};
console.log('[boot] applying database schema…');
run('npx',['prisma','db','push','--skip-generate']);

if(process.env.SEED_DEMO==='true'){
  const p = new PrismaClient();
  const count = await p.organization.count().catch(()=>0);
  await p.$disconnect();
  if(count===0){ console.log('[boot] seeding demo workspace…'); run('npx',['tsx','scripts/seed.ts']); }
  else console.log('[boot] existing data found, skipping seed');
}
const port = process.env.PORT || '3000';
console.log(`[boot] starting Next.js on 0.0.0.0:${port}`);
run('npx',['next','start','-H','0.0.0.0','-p',String(port)]);
