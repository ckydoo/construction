/* Production boot for a Supabase-backed deployment.
 * No local database, no disk volume, no automatic schema creation:
 * apply supabase/migrations with `supabase db push` before starting the app. */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();
if (!url || !anon) {
  console.error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  console.error('See .env.example / ENV_KEYS.md. Migrations are applied with `npx supabase db push`.');
  process.exit(1);
}
console.log(`Starting MYLA against Supabase (${new URL(url).host})…`);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npx, ['next', 'start', '-H', '0.0.0.0', '-p', process.env.PORT || '3000'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
