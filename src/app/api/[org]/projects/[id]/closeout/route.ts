import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { billingGuard, writeGuard, capabilityGuard } from '@/lib/guard';
import { buildScope } from '@/lib/access';
import { projectCloseout } from '@/lib/project-closeout';

type Ctx = { params: Promise<{ org: string; id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { org, id } = await params;
  const a = await apiAuth(org);
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = billingGuard(a, { write: true }) || writeGuard(a.config, a.role, 'projects') || capabilityGuard(a.role, 'records.update');
  if (g) return g;
  const scope = await buildScope(a);
  const summary = await projectCloseout(a.orgId, id, a, scope);
  if (!summary) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } });
}
