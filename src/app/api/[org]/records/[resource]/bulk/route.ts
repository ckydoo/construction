import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { getResource } from '@/lib/resources';
import { deleteGuard, capabilityGuard, billingGuard } from '@/lib/guard';
import { deleteMany } from '@/lib/records';

export async function DELETE(req: Request, { params }: { params: Promise<{ org: string; resource: string }> }) {
  const { org, resource } = await params;
  const a = await apiAuth(org); const def = getResource(resource);
  if (!a || !def) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = billingGuard(a, {write:true}) || deleteGuard(a.config, a.role, resource) || capabilityGuard(a.role, 'records.delete'); if (g) return g;
  const { ids } = await req.json();
  if (!Array.isArray(ids)) return NextResponse.json({ error: 'ids must be an array' }, { status: 400 });
  const r = await deleteMany(a.orgId, a.userId, a.name, def, ids);
  return NextResponse.json(r);
}
