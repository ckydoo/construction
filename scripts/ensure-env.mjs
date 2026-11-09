/* Create a local .env from the committed template when it is missing.
 * Called automatically by predev / prebuild / predb:* / prestart:* hooks.
 * Never overwrites an existing .env — that is where the user keeps real keys. */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const template = path.join(root, '.env.example');
const target = path.join(root, '.env');

if (!fs.existsSync(template)) {
  console.error('[env] .env.example is missing — cannot create .env');
  process.exit(1);
}
if (!fs.existsSync(target)) {
  fs.copyFileSync(template, target);
  console.log('[env] created .env from .env.example — fill in your Supabase / API keys there');
}
