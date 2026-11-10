/* Shared API guards. Every route touching a module must honour BOTH the
   workspace module switch and the caller's role — not just the list endpoint. */
import { NextResponse } from 'next/server';
import { canRead, canWrite, canDelete, canCapability, type Capability } from './catalog';
import { moduleEnabled, resourceFullyEnabled } from './module-visibility';

type Config = { resources: string[]; modules?: string[] };
type BillingAccess = { access?: boolean; writable?: boolean; readOnly?: boolean; status?: string };
const deny = (message: string, status = 403) => NextResponse.json({ error: message }, { status });

export function guardResource(config: Config, resource: string) {
  if (resourceFullyEnabled(config, resource)) return null;
  return deny('This module is not enabled for your workspace');
}

export function guardModule(config: Config, moduleId: string) {
  if (moduleEnabled(config, moduleId)) return null;
  return deny('This module is not enabled for your workspace');
}

/** Read access: module enabled AND role permitted to see this resource. */
export function readGuard(config: Config, role: string, resource: string) {
  const g = guardResource(config, resource); if (g) return g;
  if (!canRead(role, resource)) return deny('Your role cannot view this module');
  return null;
}

export function writeGuard(config: Config, role: string, resource: string) {
  const g = guardResource(config, resource); if (g) return g;
  if (!canWrite(role, resource)) return deny('Your role cannot create or edit records here');
  return null;
}

export function deleteGuard(config: Config, role: string, resource: string) {
  const g = guardResource(config, resource); if (g) return g;
  if (!canDelete(role, resource)) return deny('Your role cannot delete records');
  return null;
}

export function capabilityGuard(role: string, cap: Capability) {
  if (!canCapability(role, cap)) return deny('Your role is not permitted to do that');
  return null;
}


/** Defence in depth behind the middleware hard-lock and plan entitlement filter. */
export function billingGuard(a: { billing?: BillingAccess } | null, options: { write?: boolean } = {}) {
  if (!a?.billing) return null;
  if (!a.billing.access) return deny('A paid MYLA subscription is required. Your data has not been deleted.', 402);
  if (options.write && !a.billing.writable) return deny('This workspace is read-only while payment is overdue.', 402);
  return null;
}
