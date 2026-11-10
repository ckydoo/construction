/* Server-side page gate for direct URLs. Client-side hiding alone is not enough:
 * a user who knows /m/incidents or /wallets must not reach a disabled section. */
import { notFound } from 'next/navigation';
import { requireOrg, type AuthCtx } from './auth';
import { canRead } from './catalog';
import { moduleEnabled, resourceFullyEnabled } from './module-visibility';

export async function requirePageModule(
  org: string,
  options: { moduleId?: string; resourceId?: string } = {},
): Promise<AuthCtx> {
  const a = await requireOrg(org);
  if (options.moduleId && !moduleEnabled(a.config, options.moduleId)) notFound();
  if (options.resourceId && !resourceFullyEnabled(a.config, options.resourceId)) notFound();
  if (options.resourceId && !canRead(a.role, options.resourceId)) notFound();
  return a;
}
