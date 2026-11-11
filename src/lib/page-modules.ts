/* Server-side page gate for direct URLs. Client-side hiding alone is not enough:
 * a user who knows /m/incidents or /wallets must not reach a disabled section. */
import { notFound } from 'next/navigation';
import { requireOrg, type AuthCtx } from './auth';
import { canRead } from './catalog';
import { moduleEnabled, resourceFullyEnabled } from './module-visibility';

type PageModuleCheck = { moduleId?: string; resourceId?: string };
type PageModuleOptions = PageModuleCheck & { also?: PageModuleCheck };

export async function requirePageModule(
  org: string,
  options: PageModuleOptions = {},
): Promise<AuthCtx> {
  const a = await requireOrg(org);
  for (const check of [options, options.also || {}] as PageModuleCheck[]) {
    if (check.moduleId && !moduleEnabled(a.config, check.moduleId)) notFound();
    if (check.resourceId && !resourceFullyEnabled(a.config, check.resourceId)) notFound();
    if (check.resourceId && !canRead(a.role, check.resourceId)) notFound();
  }
  return a;
}
