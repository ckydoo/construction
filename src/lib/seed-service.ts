/* Demo workspace loader, shared by `npm run db:seed` and Settings → Load demo.
 * Uses the service-role client because it must create auth users, bypass RLS
 * while bulk-loading, and upload sample PDFs into the private Storage bucket. */
import { supabaseAdmin } from './supabase';
import { seedBusinessData, clearBusinessData, DEFAULT_BUCKET } from './seed-data';
import { storageBucket } from './files';

export async function seedDemo(orgId: string, userId: string, actorName = 'BuildOps Demo') {
  const admin = supabaseAdmin();
  return seedBusinessData(admin, orgId, userId, actorName, storageBucket() || DEFAULT_BUCKET);
}

export async function clearDemo(orgId: string) {
  return clearBusinessData(supabaseAdmin(), orgId, storageBucket() || DEFAULT_BUCKET);
}

export { seedBusinessData, clearBusinessData };
