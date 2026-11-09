/* Shared API guard: a workspace may have a module switched off, and EVERY
   route touching that module's records must honour it — not just the list. */
import { NextResponse } from 'next/server';

export function guardResource(config: { resources: string[] }, resource: string) {
  if (config.resources.includes(resource)) return null;
  return NextResponse.json({ error: 'This module is not enabled for your workspace' }, { status: 403 });
}
