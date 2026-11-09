/* Seed the BuildOps demo workspace into Supabase.
 *
 *   npm run db:seed
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env,
 * and the migrations in supabase/migrations applied (`supabase db push`).
 * Idempotent: re-running replaces business data for the demo org but reuses
 * the demo auth users so passwords and JWTs stay stable.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveWorkspace, QUALIFIERS } from '../src/lib/catalog';
import { DEMO_ORG, DEMO_USERS, DEMO_PASSWORD } from '../src/lib/demo';
import { seedBusinessData, DEFAULT_BUCKET } from '../src/lib/seed-data';

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
const bucket = (process.env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET;

async function main() {
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    console.error('Copy .env.example → .env, paste your project keys, then run `supabase db push`.');
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  console.log('Seeding BuildOps demo workspace into Supabase…');

  // 1. Private Storage bucket (migrations also create it; this makes seeding
  //    work when the bucket was deleted or when running against an older DB).
  const { data: existingBucket } = await admin.storage.getBucket(bucket);
  if (!existingBucket) {
    const { error } = await admin.storage.createBucket(bucket, {
      public: false, fileSizeLimit: 12 * 1024 * 1024,
    });
    if (error) throw new Error(`Cannot create Storage bucket: ${error.message}`);
    console.log(`  ✓ created private Storage bucket ${bucket}`);
  }

  const config = resolveWorkspace({
    companyType: 'MIXED_GROUP', size: 'ENTERPRISE', headcount: DEMO_ORG.headcount,
    revenueBand: DEMO_ORG.revenueBand, qualifiers: QUALIFIERS.map(q => q.id), addons: [],
  });

  // 2. Demo auth users. Supabase Auth owns passwords — no bcrypt, no Session table.
  const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw new Error(`Cannot list auth users: ${listErr.message}`);
  const byEmail = new Map((listed?.users || []).map(u => [String(u.email || '').toLowerCase(), u]));
  const userIds: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    const email = u.email.toLowerCase();
    let authUser = byEmail.get(email);
    if (!authUser) {
      const { data, error } = await admin.auth.admin.createUser({
        email, password: DEMO_PASSWORD, email_confirm: true,
        user_metadata: { name: u.name, avatar_color: u.color },
      });
      if (error) throw new Error(`Cannot create ${email}: ${error.message}`);
      authUser = data.user;
    } else {
      const { data, error } = await admin.auth.admin.updateUserById(authUser.id, {
        password: DEMO_PASSWORD, email_confirm: true,
        user_metadata: { name: u.name, avatar_color: u.color },
      });
      if (error) throw new Error(`Cannot update ${email}: ${error.message}`);
      authUser = data.user;
    }
    userIds[email] = authUser.id;
    // Keep public.profiles in sync (the auth.users trigger does this on create).
    await admin.from('profiles').upsert({
      id: authUser.id, name: u.name, email, avatar_color: u.color,
    }, { onConflict: 'id' });
  }
  const ownerId = userIds['owner@kestrelridge.co.zw'];

  // 3. Organisation + memberships (service role bypasses RLS for bootstrap).
  const { data: old } = await admin.from('organizations').select('id').eq('slug', DEMO_ORG.slug).maybeSingle();
  let orgId: string;
  const orgRow = {
    name: DEMO_ORG.name, slug: DEMO_ORG.slug, legal_name: DEMO_ORG.legalName,
    reg_number: DEMO_ORG.regNumber, country: DEMO_ORG.country,
    base_currency: DEMO_ORG.baseCurrency, locale_pack: DEMO_ORG.localePack,
    company_type: DEMO_ORG.companyType, size: DEMO_ORG.size, headcount: DEMO_ORG.headcount,
    revenue_band: DEMO_ORG.revenueBand, onboarded: true, config,
    created_by_id: ownerId,
  };
  if (old) {
    orgId = old.id;
    const { error } = await admin.from('organizations').update(orgRow).eq('id', orgId);
    if (error) throw new Error(`Cannot update org: ${error.message}`);
  } else {
    const { data, error } = await admin.from('organizations').insert(orgRow).select('id').single();
    if (error) throw new Error(`Cannot create org: ${error.message}`);
    orgId = data.id;
  }
  // Upsert, not delete+insert: the memberships_protect_last_owner trigger
  // intentionally refuses to remove the final OWNER row, so a plain delete
  // would leave a duplicate behind on every re-seed.
  const { error: mErr } = await admin.from('memberships').upsert(DEMO_USERS.map(u => ({
    user_id: userIds[u.email.toLowerCase()], organization_id: orgId, role: u.role,
    entity_id: u.email === 'client@westgate.co.zw' ? `${orgId}_cli-1` : null,
  })), { onConflict: 'user_id,organization_id' });
  if (mErr) throw new Error(`Cannot create memberships: ${mErr.message}`);

  // 4. Records, wallets, ledger, comments, audit trail, notifications, PDFs.
  const seeded = await seedBusinessData(admin, orgId, ownerId, 'BuildOps Demo', bucket);

  console.log(`  ✓ organisation: ${DEMO_ORG.name} (${orgId})`);
  console.log(`  ✓ ${seeded.records} records across ${config.resources.length} resources`);
  console.log(`  ✓ ${DEMO_USERS.length} demo users, notifications and audit trail`);
  console.log(`  ✓ ${config.modules.length} modules / ${config.resources.length} resources enabled`);
  console.log(`  ✓ ${seeded.wallets} client wallets with a reconciled ledger`);
  console.log(`  ✓ ${seeded.pdfs} sample PDF attachments across revision chains`);
  console.log(`  ✓ login: owner@kestrelridge.co.zw / ${DEMO_PASSWORD}`);
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
