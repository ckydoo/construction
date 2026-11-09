/* Legacy module path kept as a compatibility shim.
 * Prisma/SQLite is retired. All data access now goes through the Supabase
 * clients in ./supabase.ts; RLS in supabase/migrations/0003_rbac.sql is the
 * authority for tenancy, role and portal scope. */
export {
  supabase as sb,
  supabaseAdmin as admin,
  supabaseEnv,
  hasSupabaseConfig,
  hasServiceKey,
  unwrap,
  dbError,
} from './supabase';
