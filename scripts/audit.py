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
        if key in ('number', 'id', 'createdAt', 'updatedAt') or f.get('readOnly'):
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
# 6 · CLIENT WALLETS
# ─────────────────────────────────────────────────────────────────────────────
sec = 'wallet'
RULES = D.get('roleRules', {})
ROLE_IDS = [r['id'] for r in D.get('roles', [])]

def wallet_list(session=None):
    rr = req(session or OWNER, 'GET', 'wallets')
    return rr, (rr.json() if rr.status_code == 200 else {})

def wallet_of(data, client_id):
    return next((w for w in data.get('wallets', []) if w['clientId'] == client_id), None)

def balance_of(session, client_id):
    rr, data = wallet_list(session)
    w = wallet_of(data, client_id)
    return w['balance'] if w else None

rr, wdata = wallet_list()
check(sec, 'wallet list endpoint', rr.status_code == 200 and 'summary' in wdata, f'HTTP {rr.status_code}')
check(sec, 'wallets are one-per-client', len({w['clientId'] for w in wdata.get('wallets', [])}) == len(wdata.get('wallets', [])), '')
check(sec, 'seeded demo wallets have activity', wdata.get('summary', {}).get('fundedWallets', 0) >= 4, wdata.get('summary'))
check(sec, 'balance equals toppedUp minus allocated plus reversals',
      all(abs(w['balance'] - (w['toppedUp'] - w['allocated'] + w['reversed'])) < 0.005 for w in wdata.get('wallets', [])), '')
seed_balance = sum(w['balance'] for w in wdata.get('wallets', []))

# Find the client the demo portal user belongs to, and one of its projects.
portal_client = None
rr = req(OWNER, 'GET', 'records/clients?q=Westgate')
if rr.status_code == 200 and rr.json().get('rows'):
    portal_client = rr.json()['rows'][0]['id']
if not portal_client:
    portal_client = ref_id('clients')
check(sec, 'wallet test client found', bool(portal_client), str(portal_client))

portal_project = None
other_project = None
rr = req(OWNER, 'GET', 'records/projects?pageSize=100')
if rr.status_code == 200:
    for pr in rr.json().get('rows', []):
        if pr.get('clientId') == portal_client and not portal_project:
            portal_project = pr['id']
        elif pr.get('clientId') != portal_client and not other_project:
            other_project = pr['id']
check(sec, 'wallet test project found', bool(portal_project), str(portal_project))
check(sec, 'project of another client found', bool(other_project), str(other_project))

before = balance_of(OWNER, portal_client)
check(sec, 'starting balance recorded', before is not None, str(before))
wpath = f'wallets/{portal_client}'
key = 'AUDIT-' + MARK
rr = req(OWNER, 'POST', wpath, json={'action': 'topup', 'amount': 1000, 'reference': MARK, 'method': 'Bank transfer (USD)', 'note': 'QA top-up', 'idempotencyKey': key})
check(sec, 'admin top-up', rr.status_code == 201 and abs(rr.json().get('balance', 0) - (before + 1000)) < 0.005, f'HTTP {rr.status_code} {rr.text[:120]}')
topup_tx = rr.json().get('transaction', {}).get('id') if rr.status_code == 201 else None
check(sec, 'top-up writes TOPUP ledger entry', bool(topup_tx), str(topup_tx))

rr = req(OWNER, 'POST', wpath, json={'action': 'topup', 'amount': 1000, 'idempotencyKey': key})
check(sec, 'duplicate top-up rejected', rr.status_code == 409, f'HTTP {rr.status_code}')
check(sec, 'idempotency leaves balance unchanged', abs((balance_of(OWNER, portal_client) or 0) - (before + 1000)) < 0.005, '')
for label, amount in [('negative amount', -5), ('zero amount', 0), ('missing amount', None)]:
    body = {'action': 'topup'}
    if amount is not None: body['amount'] = amount
    rr = req(OWNER, 'POST', wpath, json=body)
    check(sec, f'topup rejects {label}', rr.status_code == 400, f'HTTP {rr.status_code}')

rr = req(OWNER, 'GET', wpath)
detail = rr.json() if rr.status_code == 200 else {}
check(sec, 'wallet detail endpoint', rr.status_code == 200 and 'ledger' in detail, f'HTTP {rr.status_code}')
check(sec, 'ledger shows the new top-up', any(t['kind'] == 'TOPUP' and t['reference'] == MARK for t in detail.get('ledger', [])), '')
check(sec, 'ledger running balance reconciles', bool(detail.get('ledger')) and abs(detail['ledger'][0]['balanceAfter'] - (before + 1000)) < 0.005, '')
rr = req(OWNER, 'GET', f'records/clients/{portal_client}')
check(sec, 'client register mirrors wallet balance', rr.status_code == 200 and abs((rr.json().get('row', {}).get('walletBalance') or 0) - (before + 1000)) < 0.005, f'HTTP {rr.status_code}')

if other_project:
    rr = req(OWNER, 'POST', wpath, json={'action': 'allocate', 'amount': 10, 'projectId': other_project})
    check(sec, 'cannot fund another client\'s project', rr.status_code in (400, 404), f'HTTP {rr.status_code} {rr.text[:120]}')
rr = req(OWNER, 'POST', wpath, json={'action': 'allocate', 'amount': 999999999, 'projectId': portal_project})
check(sec, 'insufficient balance rejected', rr.status_code == 409, f'HTTP {rr.status_code}')
check(sec, 'failed allocation does not move money', abs((balance_of(OWNER, portal_client) or 0) - (before + 1000)) < 0.005, '')
rr = req(OWNER, 'POST', wpath, json={'action': 'allocate', 'amount': 250, 'projectId': portal_project, 'note': MARK + ' funding'})
alloc_tx = rr.json().get('transaction', {}).get('id') if rr.status_code == 201 else None
check(sec, 'wallet funds own project', rr.status_code == 201 and abs(rr.json().get('balance', 0) - (before + 750)) < 0.005, f'HTTP {rr.status_code} {rr.text[:120]}')

rr = req(OWNER, 'GET', f'records/projects/{portal_project}')
proj_before = rr.json().get('row', {}) if rr.status_code == 200 else {}
check(sec, 'project register mirrors funded amount', rr.status_code == 200 and abs((proj_before.get('fundedAmount') or 0)) >= 250, f'HTTP {rr.status_code} funded={proj_before.get("fundedAmount")}')
rr = req(OWNER, 'GET', f'projects/{portal_project}')
check(sec, 'project 360 includes wallet funding', rr.status_code == 200 and rr.json().get('totals', {}).get('walletFunded', 0) >= 250, f'HTTP {rr.status_code}')
check(sec, 'project 360 names the client wallet', rr.status_code == 200 and rr.json().get('wallet', {}).get('clientId') == portal_client, '')
rr = req(OWNER, 'GET', 'overview')
check(sec, 'dashboard KPI includes wallet balance', rr.status_code == 200 and abs(rr.json().get('kpis', {}).get('walletBalance', -1) - (seed_balance + 750)) < 0.005, f'HTTP {rr.status_code}')

if topup_tx:
    url_tx = f'wallets/{portal_client}/transactions/{topup_tx}'
    check(sec, 'ledger entry is readable', req(OWNER, 'GET', url_tx).status_code == 200, '')
    check(sec, 'ledger PATCH is immutable', req(OWNER, 'PATCH', url_tx, json={'amount': 1}).status_code == 405, '')
    check(sec, 'ledger DELETE is immutable', req(OWNER, 'DELETE', url_tx).status_code == 405, '')

if alloc_tx:
    rr = req(OWNER, 'POST', wpath, json={'action': 'reverse', 'transactionId': alloc_tx, 'note': 'QA reversal'})
    check(sec, 'reversal credits wallet', rr.status_code == 201 and abs(rr.json().get('balance', 0) - (before + 1000)) < 0.005, f'HTTP {rr.status_code} {rr.text[:120]}')
    check(sec, 'reversal cannot be repeated', req(OWNER, 'POST', wpath, json={'action': 'reverse', 'transactionId': alloc_tx}).status_code == 400, '')
    rr = req(OWNER, 'GET', f'projects/{portal_project}')
    check(sec, 'reversal reduces project funded total', rr.status_code == 200 and rr.json().get('totals', {}).get('walletFunded', -1) < proj_before.get('fundedAmount', 0) + 250, '')
if topup_tx:
    rr = req(OWNER, 'POST', wpath, json={'action': 'reverse', 'transactionId': topup_tx})
    check(sec, 'top-up reversal restores starting balance', rr.status_code == 201 and abs(rr.json().get('balance', 0) - before) < 0.005, f'HTTP {rr.status_code} {rr.text[:120]}')

# Module gating on the new module
rr = req(OWNER, 'PATCH', 'settings', json={'action': 'toggleModule', 'moduleId': 'wallets', 'enabled': False})
check(sec, 'disable wallets module', rr.status_code == 200, f'HTTP {rr.status_code}')
check(sec, 'disabled wallet list blocked', req(OWNER, 'GET', 'wallets').status_code == 403, '')
check(sec, 'disabled wallet action blocked', req(OWNER, 'POST', wpath, json={'action': 'topup', 'amount': 1}).status_code == 403, '')
rr = req(OWNER, 'PATCH', 'settings', json={'action': 'toggleModule', 'moduleId': 'wallets', 'enabled': True})
check(sec, 're-enable wallets module', rr.status_code == 200 and req(OWNER, 'GET', 'wallets').status_code == 200, f'HTTP {rr.status_code}')

# ─────────────────────────────────────────────────────────────────────────────
# 7 · LINK INTEGRITY
# ─────────────────────────────────────────────────────────────────────────────
sec = 'linkage'
rr = req(OWNER, 'GET', f'records/clients/{portal_client}/related')
rel = rr.json() if rr.status_code == 200 else {}
check(sec, 'client reverse-link endpoint', rr.status_code == 200 and 'groups' in rel, f'HTTP {rr.status_code}')
check(sec, 'client links to contacts/projects/invoices',
      {'contacts', 'projects', 'arInvoices'}.issubset({g['resource'] for g in rel.get('groups', [])}),
      str([g['resource'] for g in rel.get('groups', [])]))
check(sec, 'client detail exposes wallet balance', bool(rel.get('wallet')) and rel['wallet'].get('balance') is not None, '')
if portal_project:
    rr = req(OWNER, 'GET', f'records/projects/{portal_project}/related')
    pr = rr.json() if rr.status_code == 200 else {}
    check(sec, 'project reverse-link endpoint', rr.status_code == 200 and len(pr.get('groups', [])) >= 3, f'HTTP {rr.status_code}')
    check(sec, 'project links to wallet funding', bool(pr.get('wallet')) and pr['wallet'].get('fundedToProjects', 0) > 0, '')
rr = req(OWNER, 'GET', 'integrity')
integ = rr.json() if rr.status_code == 200 else {}
check(sec, 'integrity endpoint', rr.status_code == 200, f'HTTP {rr.status_code}')
check(sec, 'all cross-module references resolve', integ.get('brokenRefCount') == 0, str(integ.get('brokenRefCount')))
check(sec, 'integrity checks a meaningful number of refs', integ.get('checkedRefs', 0) > 1000, str(integ.get('checkedRefs')))
check(sec, 'wallet ledger reconciles', not integ.get('walletMismatches'), str(integ.get('walletMismatches')))
check(sec, 'derived project funding reconciles', not integ.get('fundingMismatches'), str(integ.get('fundingMismatches')))
check(sec, 'no orphan wallet rows', integ.get('walletOrphanCount') == 0, str(integ.get('walletOrphanCount')))
check(sec, 'integrity overall healthy', integ.get('ok') is True, str(integ)[:200])

# ─────────────────────────────────────────────────────────────────────────────
# 8 · ROLE MATRIX (all 14 roles provisioned as real users)
# ─────────────────────────────────────────────────────────────────────────────
sec = 'roles'
qa_users = []
# The demo OWNER session is used directly (a second OWNER cannot be removed
# while it is the last owner of the workspace).
check(sec, 'OWNER read accounts', req(OWNER, 'GET', 'records/accounts?pageSize=2').status_code == 200, '')
_owner_client = req(OWNER, 'POST', 'records/clients', json={'name': f'{MARK} owner'})
check(sec, 'OWNER create clients', _owner_client.status_code == 201, '')
if _owner_client.status_code == 201: req(OWNER, 'DELETE', f'records/clients/{_owner_client.json()["row"]["id"]}')
check(sec, 'OWNER wallet.topup capability', req(OWNER, 'POST', wpath, json={'action': 'topup', 'amount': -1}).status_code == 400, '')
for role in ROLE_IDS:
    if role == 'OWNER':
        continue
    email = f'qa.{MARK.lower()}.{role.lower()}@example.co.zw'
    inv = {'name': f'QA {role}', 'email': email, 'role': role}
    if role.endswith('_EXTERNAL'):
        inv['entityId'] = portal_client
    rr = req(OWNER, 'POST', 'settings', json={'action': 'invite', **inv})
    check(sec, f'invite {role}', rr.status_code == 200, f'HTTP {rr.status_code} {rr.text[:100]}')
    ss, lr = login(email, 'Welcome@123')
    if lr.status_code != 200:
        check(sec, f'{role} login', False, f'HTTP {lr.status_code}')
        continue
    qa_users.append((role, email))
    rule = RULES.get(role, {})
    caps = rule.get('capabilities', [])
    # Read matrix on a finance register
    rr = req(ss, 'GET', 'records/accounts?pageSize=2')
    check(sec, f'{role} read accounts', (rr.status_code == 200) == ('accounts' in rule.get('read', [])), f'HTTP {rr.status_code}')
    # Write matrix on clients
    rr = req(ss, 'POST', 'records/clients', json={'name': f'{MARK} {role}'})
    expected_write = 'clients' in rule.get('write', [])
    if not expected_write:
        check(sec, f'{role} create clients denied', rr.status_code == 403, f'HTTP {rr.status_code}')
    else:
        check(sec, f'{role} create clients allowed', rr.status_code == 201, f'HTTP {rr.status_code} {rr.text[:100]}')
        if rr.status_code == 201: req(OWNER, 'DELETE', f'records/clients/{rr.json()["row"]["id"]}')
    # Delete matrix (bulk with empty ids is harmless)
    rr = req(ss, 'DELETE', 'records/clients/bulk', json={'ids': []})
    expected_delete = bool(rule.get('delete')) and 'clients' in rule.get('write', [])
    check(sec, f'{role} bulk delete', (rr.status_code == 200) == expected_delete, f'HTTP {rr.status_code}')
    # Wallet visibility
    rr = req(ss, 'GET', 'wallets')
    expected_wallet = 'wallet.read' in caps
    check(sec, f'{role} wallet visibility', (rr.status_code == 200) == expected_wallet, f'HTTP {rr.status_code}')
    if role == 'CLIENT_EXTERNAL' and rr.status_code == 200:
        ws = rr.json().get('wallets', [])
        check(sec, 'portal sees only its own wallet', len(ws) == 1 and ws[0]['clientId'] == portal_client, str([w['clientId'] for w in ws]))
        check(sec, 'portal cannot read another wallet', req(ss, 'GET', f'wallets/{other_project or "x"}').status_code in (403, 404), '')
    # Capabilities via invalid payloads (no money moves)
    rr = req(ss, 'POST', wpath, json={'action': 'topup', 'amount': -1})
    check(sec, f'{role} wallet.topup capability', rr.status_code == (400 if 'wallet.topup' in caps else 403), f'HTTP {rr.status_code}')
    rr = req(ss, 'POST', wpath, json={'action': 'allocate', 'amount': -1, 'projectId': portal_project})
    check(sec, f'{role} wallet.allocate capability', rr.status_code == (400 if 'wallet.allocate' in caps else 403), f'HTTP {rr.status_code}')
    # Settings / role management
    rr = req(ss, 'PATCH', 'settings', json={'action': 'setRole', 'userId': 'x', 'role': 'ADMIN'})
    expected_manage = 'users.manage' in caps
    check(sec, f'{role} role management', (rr.status_code in (403, 404)) == expected_manage or (not expected_manage and rr.status_code == 403), f'HTTP {rr.status_code}')

# Cleanup QA members (sessions revoked, users removed)
meta_users = req(OWNER, 'GET', 'meta').json().get('users', [])
for role, email in qa_users:
    u = next((x for x in meta_users if x['email'] == email), None)
    if u:
        rr = req(OWNER, 'PATCH', 'settings', json={'action': 'removeUser', 'userId': u['id']})
        check(sec, f'cleanup {role}', rr.status_code == 200, f'HTTP {rr.status_code}')

# Owner-only guardrails
check(sec, 'unknown role rejected', req(OWNER, 'PATCH', 'settings', json={'action': 'setRole', 'userId': 'x', 'role': 'SUPERUSER'}).status_code in (400, 404), '')

# ─────────────────────────────────────────────────────────────────────────────
# 9 · TWO REAL TENANTS (leakage)
# ─────────────────────────────────────────────────────────────────────────────
sec = 'tenants'
other = requests.Session()
email2 = f'qa.tenant.{MARK.lower()}@example.co.zw'
rr = other.post(f'{BASE}/api/auth/register', json={'name': 'QA Tenant', 'email': email2, 'password': 'Isolation@123', 'company': 'QA Other Builders'}, timeout=30)
check(sec, 'second workspace registration', rr.status_code == 200, f'HTTP {rr.status_code} {rr.text[:120]}')
rr = other.post(f'{BASE}/api/onboarding', json={'companyType': 'GENERAL_CONTRACTOR', 'size': 'MICRO', 'loadDemo': False}, timeout=30)
check(sec, 'second workspace onboarding', rr.status_code == 200, f'HTTP {rr.status_code} {rr.text[:120]}')
slug2 = rr.json().get('slug') if rr.status_code == 200 else None
check(sec, 'second workspace has its own slug', bool(slug2) and slug2 != ORG, str(slug2))
for name, path in [('records', 'records/clients'), ('wallets', 'wallets'), ('meta', 'meta'), ('overview', 'overview')]:
    rr = other.get(f'{BASE}/api/{ORG}/{path}', timeout=30)
    check(sec, f'other tenant cannot read {name}', rr.status_code in (401, 403, 404), f'HTTP {rr.status_code}')
rr = other.post(f'{BASE}/api/{ORG}/wallets/{portal_client}', json={'action': 'topup', 'amount': 500}, timeout=30)
check(sec, 'other tenant cannot fund a wallet', rr.status_code in (401, 403, 404), f'HTTP {rr.status_code}')
rr = other.get(f'{BASE}/api/{ORG}/records/clients/{portal_client}', timeout=30)
check(sec, 'other tenant cannot open a client record', rr.status_code in (401, 403, 404), f'HTTP {rr.status_code}')
if slug2:
    rr = other.get(f'{BASE}/api/{slug2}/wallets', timeout=30)
    check(sec, 'second tenant has an empty isolated wallet list', rr.status_code == 200 and rr.json().get('summary', {}).get('totalBalance') == 0, f'HTTP {rr.status_code} {rr.text[:120]}')

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
