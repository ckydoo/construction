/* One source of truth for strict module visibility.
 * A resource is available only when BOTH its module switch and its resource ID
 * are enabled. Settings/Onboarding are the only surfaces allowed to show the
 * full catalogue so an owner can switch a hidden section back on. */
import { MODULES, type ModuleDef } from './catalog';
import { RESOURCES, RESOURCE_MAP, type ResourceDef, type Field } from './resources';

export type ConfigLike = { modules?: string[]; resources?: string[] };
export const EMPTY_CONFIG: ConfigLike = { modules: [], resources: [] };

export const SPECIAL_ROUTE_MODULES: Record<string, string> = {
  dashboard: 'dashboard',
  'my-work': 'dashboard',
  documentation: 'dashboard',
  library: 'documents',
  quotes: 'estimating',
  wallets: 'wallets',
  reports: 'reports',
};

export function enabledModules(config: ConfigLike): string[] {
  return Array.isArray(config?.modules) ? config.modules : [];
}
export function enabledResources(config: ConfigLike): string[] {
  return Array.isArray(config?.resources) ? config.resources : [];
}
export function moduleEnabled(config: ConfigLike, moduleId?: string | null): boolean {
  return !moduleId || enabledModules(config).includes(moduleId);
}
export function resourceEnabled(config: ConfigLike, resourceId?: string | null): boolean {
  return !resourceId || enabledResources(config).includes(resourceId);
}
export function moduleForResource(resourceId: string): string | undefined {
  return RESOURCE_MAP[resourceId]?.module;
}
export function resourceFullyEnabled(config: ConfigLike, resourceId?: string | null): boolean {
  if (!resourceId) return true;
  return resourceEnabled(config, resourceId) && moduleEnabled(config, moduleForResource(resourceId));
}
export function visibleModuleDefs(config: ConfigLike): ModuleDef[] {
  const on = new Set(enabledModules(config));
  return MODULES.filter(m => on.has(m.id));
}
export function visibleResourceDefs(config: ConfigLike): ResourceDef[] {
  return RESOURCES.filter(r => resourceFullyEnabled(config, r.id));
}
export function visibleResourceIds(config: ConfigLike): string[] {
  return visibleResourceDefs(config).map(r => r.id);
}
/** Hide form/detail columns and reference fields that point at a disabled module. */
export function visibleFields(def: ResourceDef, config: ConfigLike): Field[] {
  return def.fields.filter(f => !f.hidden && (f.type !== 'ref' || resourceFullyEnabled(config, f.ref)));
}
export function visibleColumns(def: ResourceDef, config: ConfigLike): string[] {
  return def.columns.filter(c => {
    const f = def.fields.find(x => x.key === c);
    return !f || f.type !== 'ref' || resourceFullyEnabled(config, f.ref);
  });
}
export function visibleRefTargets(def: ResourceDef, config: ConfigLike): string[] {
  return Array.from(new Set(visibleFields(def, config)
    .filter(f => f.type === 'ref' && f.ref)
    .map(f => f.ref!)));
}

/** Hide links to disabled special pages or record registers. */
export function hrefVisible(rawHref: string | null | undefined, config: ConfigLike): boolean {
  if (!rawHref) return true;
  const href = rawHref.split(/[?#]/)[0];
  const resource = href.match(/(?:^|\/)m\/([^/]+)/)?.[1];
  if (resource) return resourceFullyEnabled(config, resource);
  const special = href.match(/(?:^|\/)(dashboard|my-work|documentation|library|quotes|wallets|reports)(?:\/|$)/)?.[1];
  if (special) {
    if (special === 'library') return resourceFullyEnabled(config, 'documents');
    if (special === 'quotes') return resourceFullyEnabled(config, 'estimates');
    return moduleEnabled(config, SPECIAL_ROUTE_MODULES[special]);
  }
  return true;
}

/** Hide audit/activity rows belonging to a disabled resource or module. */
export function auditResourceVisible(resource: string | null | undefined, config: ConfigLike): boolean {
  if (!resource) return true;
  if (RESOURCE_MAP[resource]) return resourceFullyEnabled(config, resource);
  if (MODULES.some(m => m.id === resource)) return moduleEnabled(config, resource);
  return true;
}

export function moduleForPath(pathname: string): string | null {
  const parts = String(pathname || '').split('/').filter(Boolean);
  if (parts[1] === 'm') return moduleForResource(parts[2]) || null;
  const special = parts[1];
  if (special === 'library') return 'documents';
  return SPECIAL_ROUTE_MODULES[special] || null;
}
