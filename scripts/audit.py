#!/usr/bin/env python3
"""BuildOps module audit — exercises CRUD, references, RBAC and module gating
against a running server. Usage:

    npx tsx scripts/audit-defs.ts > /tmp/defs.json
    python3 scripts/audit.py [--base http://127.0.0.1:3000] [--json report.json]

Creates temporary QA records and soft-deletes them. Does not touch seeded data.
"""
import argparse
import json
import sys
import uuid
from collections import defaultdict

import requests

AP = argparse.ArgumentParser()
AP.add_argument('--base', default='http://127.0.0.1:3000')
AP.add_argument('--defs', default='/tmp/defs.json')
AP.add_argument('--json', default='/home/user/buildops/AUDIT_REPORT.json')
ARGS = AP.parse_args()

BASE = ARGS.base.rstrip('/')
ORG = 'kestrel-ridge'
D = json.load(open(ARGS.defs))
RESOURCES = D['resources']
MODULES = D['modules']
RMAP = {r['id']: r for r in RESOURCES}

results = []           # list of dicts: section, check, ok, detail
failures = []


def check(section, name, ok, detail=''):
    results.append({'section': section, 'check': name, 'ok': bool(ok), 'detail': str(detail)[:300]})
    if not ok:
        failures.append(f'{section} / {name}: {detail}')
    return ok


def login(email, password='Demo@1234'):
    s = requests.Session()
    r = s.post(f'{BASE}/api/auth/login', json={'email': email, 'password': password}, timeout=30)
    return s, r


def url(path):
    return f'{BASE}/api/{ORG}/{path}'


OWNER, r = login('owner@kestrelridge.co.zw')
check('auth', 'owner login', r.status_code == 200 and r.json().get('ok'), r.text[:120])
if r.status_code != 200:
    print('Cannot log in — aborting', r.text)
    sys.exit(1)

MARK = 'QA' + uuid.uuid4().hex[:6].upper()
REF_CACHE = {}


def ref_id(resource):
    """Return a valid record id for a referenced resource."""
    if resource in REF_CACHE:
        return REF_CACHE[resource]
    try:
        rr = OWNER.get(url(f'records/{resource}?mode=refs'), timeout=30)
        opts = rr.json().get('options', [])
        if opts:
            REF_CACHE[resource] = opts[0]['value']
            return REF_CACHE[resource]
    except Exception:
        pass
    REF_CACHE[resource] = None
    return None


def value_for(field, marker=None):
    key, typ = field['key'], field['type']
    opts = field.get('options')
    if typ in ('number', 'currency', 'percent'):
        return 123.45
    if typ == 'boolean':
        return True
    if typ == 'tags':
        return ['QA', 'audit']
    if typ == 'email':
        return f'qa.{MARK.lower()}@example.co.zw'
    if typ == 'phone':
        return '+263 77 000 0000'
    if typ == 'date':
        return '2026-11-07'
    if typ == 'datetime':
        return '2026-11-07T09:00'
    if typ == 'ref':
        return ref_id(field['ref'])
    if typ == 'select':
        return opts[0] if opts else 'QA'
    if typ == 'text':
        return f'{MARK} {key}' if marker is None else marker
    if typ == 'textarea':
        return f'{MARK} notes for {key}'
    return f'{MARK} {key}'


def payload(defn, marker=None, overrides=None):
    p = {}
    for f in defn['fields']:
        key = f['key']
        if key in ('number', 'id', 'createdAt', 'updatedAt'):
            continue
        if key == 'status' and defn.get('statusOptions'):
            p[key] = defn['statusOptions'][0]
            continue
        if key == defn['titleKey']:
            p[key] = value_for(f, f'{MARK} {defn["id"]}' if marker is None else marker)
            continue
        v = value_for(f)
        if v is None and not f['required']:
            continue
        p[key] = v
    if overrides:
        p.update(overrides)
    return p


def req(session, method, path, **kw):
    try:
        return session.request(method, url(path), timeout=30, **kw)
    except Exception as e:
        class Fake:
            status_code = 0
            text = str(e)
            def json(self): return {}
        return Fake()


# ─────────────────────────────────────────────────────────────────────────────
# 1 · PER-RESOURCE CRUD
# ─────────────────────────────────────────────────────────────────────────────
created_by_resource = {}
for defn in RESOURCES:
    rid = defn['id']
    sec = f'crud:{rid}'
    rr = req(OWNER, 'GET', f'records/{rid}?pageSize=5')
    ok = rr.status_code == 200 and isinstance(rr.json().get('rows'), list)
    check(sec, 'list', ok, f'HTTP {rr.status_code}')

    rr = req(OWNER, 'GET', f'records/{rid}?mode=refs')
    check(sec, 'refs', rr.status_code == 200 and isinstance(rr.json().get('options'), list), f'HTTP {rr.status_code}')

    body = payload(defn)
    rr = req(OWNER, 'POST', f'records/{rid}', json=body)
    if not check(sec, 'create', rr.status_code == 201, f'HTTP {rr.status_code} {rr.text[:150]}'):
        continue
    row = rr.json()['row']
    rec_id = row['id']
    created_by_resource[rid] = rec_id
    check(sec, 'sequence number', str(row.get('number', '')).startswith(defn['prefix'] + '-'), row.get('number'))
    check(sec, 'title derived', row.get('title') == body.get(defn['titleKey']), f'{row.get("title")} vs {body.get(defn["titleKey"])}')
    has_status = any(f['key'] == 'status' for f in defn['fields']) or bool(defn.get('statusOptions'))
    if has_status:
        check(sec, 'status default', bool(row.get('status')), row.get('status'))

    rr = req(OWNER, 'GET', f'records/{rid}/{rec_id}')
    ok = rr.status_code == 200 and all(k in rr.json() for k in ('row', 'comments', 'files'))
    check(sec, 'detail shape', ok, f'HTTP {rr.status_code}')

    # A PATCH with a partial body must not wipe the other fields.
    sentinel = None
    for f in defn['fields']:
        k = f['key']
        if k in (defn['titleKey'], 'status', 'projectId', 'number') or k not in body:
            continue
        if f['type'] in ('text', 'textarea', 'number', 'currency', 'percent', 'email', 'phone', 'date'):
            sentinel = (k, body[k])
            break
    new_title = f'{MARK} UPDATED {rid}'
    rr = req(OWNER, 'PATCH', f'records/{rid}/{rec_id}', json={defn['titleKey']: new_title})
    check(sec, 'partial update', rr.status_code == 200, f'HTTP {rr.status_code} {rr.text[:150]}')
    if rr.status_code == 200:
        after = req(OWNER, 'GET', f'records/{rid}/{rec_id}').json().get('row', {})
        check(sec, 'update preserves other fields',
              sentinel is None or after.get(sentinel[0]) == sentinel[1],
              f'{sentinel}: got {after.get(sentinel[0]) if sentinel else "n/a"}')
        check(sec, 'title updated', after.get('title') == new_title, after.get('title'))

    rr = req(OWNER, 'POST', f'records/{rid}/{rec_id}/comments', json={'body': f'{MARK} audit comment'})
    check(sec, 'comment create', rr.status_code == 201, f'HTTP {rr.status_code}')
    rr = req(OWNER, 'GET', f'records/{rid}/{rec_id}')
    check(sec, 'comment visible', rr.status_code == 200 and len(rr.json().get('comments', [])) >= 1,
          f'HTTP {rr.status_code}')

    rr = req(OWNER, 'GET', f'records/{rid}?q={MARK}')
    ok = rr.status_code == 200 and any(x['id'] == rec_id for x in rr.json().get('rows', []))
    check(sec, 'search finds record', ok, f'HTTP {rr.status_code}')

    st = row.get('status')
    if st:
        rr = req(OWNER, 'GET', f'records/{rid}?status={st}')
        ok = rr.status_code == 200 and any(x['id'] == rec_id for x in rr.json().get('rows', []))
        check(sec, 'status filter', ok, f'HTTP {rr.status_code}')

    rr = req(OWNER, 'GET', f'records/{rid}?mode=csv')
    check(sec, 'csv export', rr.status_code == 200 and rr.text.startswith('Record no.'), f'HTTP {rr.status_code}')

    sort_key = defn.get('amountKey') or (defn['columns'][1] if len(defn['columns']) > 1 else 'createdAt')
    rr = req(OWNER, 'GET', f'records/{rid}?sort={sort_key}&dir=desc')
    check(sec, 'sort', rr.status_code == 200, f'HTTP {rr.status_code}')

    if any(f['required'] for f in defn['fields']):
        rr = req(OWNER, 'POST', f'records/{rid}', json={})
        check(sec, 'validation rejects empty', rr.status_code == 400, f'HTTP {rr.status_code}')

    rr = req(OWNER, 'DELETE', f'records/{rid}/{rec_id}')
    check(sec, 'delete', rr.status_code == 200, f'HTTP {rr.status_code}')
    rr = req(OWNER, 'GET', f'records/{rid}/{rec_id}')
    check(sec, 'soft-delete hides detail', rr.status_code == 404, f'HTTP {rr.status_code}')

    # bulk delete
    bulk_ids = []
    for _ in range(2):
        b = req(OWNER, 'POST', f'records/{rid}', json=payload(defn))
        if b.status_code == 201:
            bulk_ids.append(b.json()['row']['id'])
    rr = req(OWNER, 'DELETE', f'records/{rid}/bulk', json={'ids': bulk_ids})
    ok = rr.status_code == 200 and rr.json().get('count') == len(bulk_ids)
    check(sec, 'bulk delete', ok, f'HTTP {rr.status_code} {rr.text[:120]}')

print(f'[audit] CRUD pass complete: {len(results)} checks, {len(failures)} failures', flush=True)

# ─────────────────────────────────────────────────────────────────────────────
# 2 · CROSS-MODULE CONNECTIVITY
# ─────────────────────────────────────────────────────────────────────────────
sec = 'connectivity'
# create one client and one project, then link several modules to that project
cl = req(OWNER, 'POST', 'records/clients', json=payload(RMAP['clients']))
project_id, client_id = None, None
if cl.status_code == 201:
    client_id = cl.json()['row']['id']
    REF_CACHE['clients'] = client_id
pr = req(OWNER, 'POST', 'records/projects', json=payload(RMAP['projects'], overrides={'clientId': client_id}))
if pr.status_code == 201:
    project_id = pr.json()['row']['id']
    REF_CACHE['projects'] = project_id
check(sec, 'client → project link', bool(client_id and project_id), f'client={client_id} project={project_id}')

linked = {}
for rid in ['estimates', 'contracts', 'arInvoices', 'paymentApps', 'rfis', 'submittals',
            'changeOrders', 'dailyLogs', 'purchaseOrders', 'timesheets', 'incidents', 'tasks']:
    if rid not in RMAP:
        continue
    overrides = {}
    defn = RMAP[rid]
    keys = [f['key'] for f in defn['fields']]
    if 'projectId' in keys and project_id:
        overrides['projectId'] = project_id
    if 'clientId' in keys and client_id:
        overrides['clientId'] = client_id
    rr = req(OWNER, 'POST', f'records/{rid}', json=payload(defn, overrides=overrides))
    if rr.status_code == 201:
        linked[rid] = rr.json()['row']['id']
    check(sec, f'create {rid} linked to project', rr.status_code == 201, f'HTTP {rr.status_code} {rr.text[:120]}')

if project_id:
    rr = req(OWNER, 'GET', f'projects/{project_id}')
    check(sec, 'project 360 endpoint', rr.status_code == 200, f'HTTP {rr.status_code}')
    for rid, rec_id in linked.items():
        if 'projectId' not in [f['key'] for f in RMAP[rid]['fields']]:
            continue
        rr = req(OWNER, 'GET', f'records/{rid}?projectId={project_id}')
        ok = rr.status_code == 200 and any(x['id'] == rec_id for x in rr.json().get('rows', []))
        check(sec, f'project filter finds {rid}', ok, f'HTTP {rr.status_code}')

rr = req(OWNER, 'GET', f'search?q={MARK}')
check(sec, 'global search spans modules', rr.status_code == 200, f'HTTP {rr.status_code}')

rr = req(OWNER, 'GET', 'overview')
check(sec, 'overview aggregates', rr.status_code == 200, f'HTTP {rr.status_code}')

# broken reference must be rejected (referential integrity)
if 'rfis' in RMAP:
    rr = req(OWNER, 'POST', 'records/rfis', json=payload(RMAP['rfis'], overrides={'projectId': 'NOT-A-REAL-ID'}))
    check(sec, 'invalid project reference rejected', rr.status_code == 400,
          f'HTTP {rr.status_code} {rr.text[:120]}')
    if rr.status_code == 201:
        req(OWNER, 'DELETE', f'records/rfis/{rr.json()["row"]["id"]}')

# cleanup linked records
for rid, rec_id in linked.items():
    req(OWNER, 'DELETE', f'records/{rid}/{rec_id}')
if project_id:
    req(OWNER, 'DELETE', f'records/projects/{project_id}')
if client_id:
    req(OWNER, 'DELETE', f'records/clients/{client_id}')

# ─────────────────────────────────────────────────────────────────────────────
# 3 · RBAC
# ─────────────────────────────────────────────────────────────────────────────
sec = 'rbac'
PORTAL, rr = login('client@westgate.co.zw')
check(sec, 'portal login', rr.status_code == 200, f'HTTP {rr.status_code}')
check(sec, 'portal can read', req(PORTAL, 'GET', 'records/clients?pageSize=3').status_code == 200, '')
real_client = ref_id('clients') or 'x'
for name, method, path, kw in [
    ('portal cannot create', 'POST', 'records/clients', {'json': {'name': 'QA blocked'}}),
    ('portal cannot edit', 'PATCH', f'records/clients/{real_client}', {'json': {'name': 'QA blocked'}}),
    ('portal cannot delete', 'DELETE', f'records/clients/{real_client}', {}),
    ('portal cannot bulk delete', 'DELETE', 'records/clients/bulk', {'json': {'ids': []}}),
]:
    rr = req(PORTAL, method, path, **kw)
    # 403 expected; 404 means the id was bogus (still not a write)
    check(sec, name, rr.status_code in (403, 404), f'HTTP {rr.status_code}')

ANON = requests.Session()
check(sec, 'unauthenticated blocked', req(ANON, 'GET', 'meta').status_code == 401, '')

# ─────────────────────────────────────────────────────────────────────────────
# 4 · MODULE GATING
# ─────────────────────────────────────────────────────────────────────────────
sec = 'gating'
target_res = 'incidents' if 'incidents' in RMAP else RESOURCES[10]['id']
mod = next((m for m in MODULES if target_res in m['resources']), None)
if mod:
    mid = mod['id']
    existing = req(OWNER, 'GET', f'records/{target_res}?pageSize=1').json().get('rows', [])
    existing_id = existing[0]['id'] if existing else None
    rr = req(OWNER, 'PATCH', 'settings', json={'action': 'toggleModule', 'moduleId': mid, 'enabled': False})
    check(sec, 'disable module', rr.status_code == 200, f'HTTP {rr.status_code}')
    for name, method, path, kw in [
        ('disabled list blocked', 'GET', f'records/{target_res}?pageSize=3', {}),
        ('disabled create blocked', 'POST', f'records/{target_res}', {'json': payload(RMAP[target_res])}),
        ('disabled detail blocked', 'GET', f'records/{target_res}/{existing_id or "x"}', {}),
        ('disabled edit blocked', 'PATCH', f'records/{target_res}/{existing_id or "x"}', {'json': {'name': 'x'}}),
        ('disabled delete blocked', 'DELETE', f'records/{target_res}/{existing_id or "x"}', {}),
        ('disabled bulk blocked', 'DELETE', f'records/{target_res}/bulk', {'json': {'ids': []}}),
        ('disabled csv blocked', 'GET', f'records/{target_res}?mode=csv', {}),
    ]:
        rr = req(OWNER, method, path, **kw)
        check(sec, name, rr.status_code == 403, f'HTTP {rr.status_code} {rr.text[:100]}')
    rr = req(OWNER, 'PATCH', 'settings', json={'action': 'toggleModule', 'moduleId': mid, 'enabled': True})
    check(sec, 're-enable module', rr.status_code == 200, f'HTTP {rr.status_code}')
    check(sec, 'list works again', req(OWNER, 'GET', f'records/{target_res}?pageSize=3').status_code == 200, '')

    # Essentials-first pack switch (Settings → Modules)
    rr = req(OWNER, 'PATCH', 'settings', json={'action': 'applyPack', 'pack': 'essentials'})
    check(sec, 'apply essentials pack', rr.status_code == 200, f'HTTP {rr.status_code}')
    check(sec, 'essentials disables non-core resource',
          req(OWNER, 'GET', f'records/{target_res}?pageSize=3').status_code == 403, '')
    check(sec, 'essentials keeps core chain',
          req(OWNER, 'GET', 'records/clients?pageSize=3').status_code == 200, '')
    rr = req(OWNER, 'PATCH', 'settings', json={'action': 'applyPack', 'pack': 'full'})
    check(sec, 'restore full pack', rr.status_code == 200, f'HTTP {rr.status_code}')
    check(sec, 'resource restored', req(OWNER, 'GET', f'records/{target_res}?pageSize=3').status_code == 200, '')
else:
    check(sec, 'module found for gating test', False, f'no module owns {target_res}')

# ─────────────────────────────────────────────────────────────────────────────
# 5 · TENANT ISOLATION
# ─────────────────────────────────────────────────────────────────────────────
sec = 'isolation'
check(sec, 'unknown org rejected',
      OWNER.get(f'{BASE}/api/not-a-real-org/records/clients', timeout=30).status_code in (401, 403, 404), '')

# ─────────────────────────────────────────────────────────────────────────────
report = {
    'base': BASE, 'marker': MARK,
    'resources': len(RESOURCES), 'modules': len(MODULES),
    'checks': len(results), 'failures': failures,
    'by_section': {},
    'results': results,
}
by = defaultdict(lambda: {'total': 0, 'failed': 0})
for r in results:
    key = r['section'].split(':')[0]
    by[key]['total'] += 1
    if not r['ok']:
        by[key]['failed'] += 1
report['by_section'] = dict(by)
json.dump(report, open(ARGS.json, 'w'), indent=2)
print(f'\n=== AUDIT SUMMARY ===')
for k, v in sorted(by.items()):
    print(f'  {k:15s} {v["total"]-v["failed"]:4d}/{v["total"]:<4d} passed   failures={v["failed"]}')
print(f'  TOTAL          {len(results)-len(failures)}/{len(results)} passed, {len(failures)} failures')
if failures:
    print('\n=== FAILURES ===')
    for f in failures[:60]:
        print('  ✗', f)
    if len(failures) > 60:
        print(f'  ... and {len(failures)-60} more (see {ARGS.json})')
sys.exit(1 if failures else 0)
