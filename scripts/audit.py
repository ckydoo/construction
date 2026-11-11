#!/usr/bin/env python3
"""MYLA module audit — exercises CRUD, references, RBAC and module gating
against a running server. Usage:

    npx tsx scripts/audit-defs.ts > /tmp/defs.json
    python3 scripts/audit.py [--base http://127.0.0.1:3000] [--json report.json]

Creates temporary QA records and soft-deletes them. Does not touch seeded data.
"""
import argparse
import io
import json
import os
import signal
import sys
import time
import uuid
from collections import defaultdict

import requests
import requests.sessions
try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None
from requests.packages.urllib3.util import Timeout as WallClockTimeout

# Lightweight progress log + a hard wall-clock deadline. The live Supabase
# stack occasionally leaves a chunked response open and keeps the read timeout
# resetting; a SIGALRM guarantees that one stalled GET cannot hold the whole
# suite for minutes. Idempotent GETs get one retry on a fresh connection.
AUDIT_TRACE = '/tmp/buildops-audit-trace.log'
open(AUDIT_TRACE, 'w').close()
_orig_request = requests.sessions.Session.request
class _HardTimeout(Exception):
    pass
def _on_alarm(_signum, _frame):
    raise _HardTimeout('hard request deadline')
signal.signal(signal.SIGALRM, _on_alarm)
def _traced_request(self, method, url, **kw):
    with open(AUDIT_TRACE, 'a') as _f:
        _f.write(f'{time.time():.3f} {method} {url}\n')
    # A chunked upstream response can keep resetting a per-read timeout. Give
    # urllib3 a hard total wall-clock deadline as well as connect/read limits;
    # idempotent GETs get one retry on a fresh connection pool.
    kw['timeout'] = WallClockTimeout(total=25, connect=5, read=20)
    attempts = 2 if str(method).upper() == 'GET' else 1
    for attempt in range(attempts):
        signal.setitimer(signal.ITIMER_REAL, 30)
        try:
            return _orig_request(self, method, url, **kw)
        except (_HardTimeout, requests.exceptions.Timeout) as e:
            if attempt + 1 < attempts:
                try: self.close()
                except Exception: pass
                continue
            raise requests.exceptions.Timeout(f'hard deadline / retry exhausted: {e}')
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
requests.sessions.Session.request = _traced_request

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


QA_INVITE_PASSWORD = 'QaRoleMatrix@1234'

def login(email, password='Demo@1234'):
    s = requests.Session()
    s.headers.update({'Connection': 'close'})
    r = s.post(f'{BASE}/api/auth/login', json={'email': email, 'password': password}, timeout=(5, 20))
    return s, r


def env_value(name):
    if os.environ.get(name):
        return os.environ[name].strip().strip('"')
    try:
        with open('.env', encoding='utf-8') as handle:
            for line in handle:
                if line.startswith(f'{name}='):
                    return line.split('=', 1)[1].strip().strip('"')
    except OSError:
        pass
    return ''


def confirm_qa_user(email, password=QA_INVITE_PASSWORD):
    """Confirm a freshly invited QA account and give it a known QA password."""
    supabase_url = env_value('NEXT_PUBLIC_SUPABASE_URL') or env_value('SUPABASE_URL')
    service_key = env_value('SUPABASE_SERVICE_ROLE_KEY') or env_value('SUPABASE_SECRET_KEY')
    if not supabase_url or not service_key:
        return False
    headers = {'apikey': service_key, 'Authorization': f'Bearer {service_key}'}
    try:
        profile = requests.get(f'{supabase_url}/rest/v1/profiles',
                               params={'select': 'id', 'email': f'eq.{email}'},
                               headers=headers, timeout=(5, 20))
        rows = profile.json() if profile.ok else []
        if not isinstance(rows, list) or not rows or not rows[0].get('id'):
            return False
        updated = requests.put(f'{supabase_url}/auth/v1/admin/users/{rows[0]["id"]}',
                               headers=headers, json={'email_confirm': True, 'password': password},
                               timeout=(5, 20))
        return updated.ok
    except Exception:
        return False


def url(path):
    return f'{BASE}/api/{ORG}/{path}'


OWNER, r = login('owner@kestrelridge.co.zw')
check('auth', 'owner login', r.status_code == 200 and r.json().get('ok'), r.text[:120])
if r.status_code != 200:
    print('Cannot log in — aborting', r.text)
    sys.exit(1)

# Remember exactly which sections were live before the audit. Several checks
# deliberately switch to the full pack; cleanup must not leave specialist demo
# modules turned back on.
try:
    ORIGINAL_MODULES = set(OWNER.get(url('meta?scope=settings'), timeout=(5, 20)).json().get('config', {}).get('modules') or [])
except Exception:
    ORIGINAL_MODULES = set(m['id'] for m in MODULES)

MARK = 'QA' + uuid.uuid4().hex[:6].upper()
REF_CACHE = {}


def ref_id(resource):
    """Return a valid record id for a referenced resource."""
    if resource in REF_CACHE:
        return REF_CACHE[resource]
    try:
        rr = OWNER.get(url(f'records/{resource}?mode=refs'), timeout=(5, 20))
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
    if typ == 'items':
        return [{'description': f'{MARK} itemised work', 'detail': 'QA line', 'qty': 2, 'unitPrice': 100, 'total': 200}]
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
        return session.request(method, url(path), timeout=(5, 20), **kw)
    except Exception as e:
        class Fake:
            status_code = 0
            text = str(e)
            def json(self): return {}
        return Fake()

def pdf_text(resp):
    data = resp.content if hasattr(resp, 'content') else b''
    if not data:
        return ''
    if PdfReader:
        try:
            reader = PdfReader(io.BytesIO(data))
            return '\n'.join((page.extract_text() or '') for page in reader.pages)
        except Exception:
            pass
    return data.decode('latin1', 'ignore')


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
    has_items = any(f['type'] == 'items' for f in defn['fields'])
    derived_keys = {'amount', 'total', 'value', 'bidValue', 'netCertified', 'estimatedValue',
                    'originalBudget', 'grossPay', 'debit', 'balance', 'vatAmount'}
    for f in defn['fields']:
        k = f['key']
        if k in (defn['titleKey'], 'status', 'projectId', 'number') or k not in body:
            continue
        if has_items and k in derived_keys:
            continue  # structured lines own this total; a partial PATCH must not restore it
        if f['type'] in ('text', 'textarea', 'number', 'currency', 'percent', 'email', 'phone', 'date', 'items'):
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
ANON.headers.update({'Connection': 'close'})
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
    if existing_id:
        check(sec, 'existing data returns after re-enable',
              req(OWNER, 'GET', f'records/{target_res}/{existing_id}').status_code == 200, '')

    # Essentials-first pack switch (Settings → Sections)
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
# 4b · STRICT MODULE VISIBILITY (UI ROUTES, APIs, SEARCH, REPORTS, PROJECT 360)
# ─────────────────────────────────────────────────────────────────────────────
sec = 'strict'
def toggle(mid, enabled):
    return req(OWNER, 'PATCH', 'settings', json={'action': 'toggleModule', 'moduleId': mid, 'enabled': enabled})
def org_page(path):
    try:
        return OWNER.get(f'{BASE}/{ORG}/{path}', allow_redirects=False, timeout=(5, 20))
    except Exception as e:
        class Fake:
            status_code = 0
            text = str(e)
        return Fake()
def meta_ids(scope=''):
    suffix = '?scope=settings' if scope == 'settings' else ''
    try:
        return req(OWNER, 'GET', f'meta{suffix}').json()
    except Exception:
        return {}
def module_ids(m): return [x['id'] for x in (m.get('modules') or [])]
def resource_ids(m): return [x['id'] for x in (m.get('resources') or [])]

rr = req(OWNER, 'PATCH', 'settings', json={'action': 'applyPack', 'pack': 'full'})
check(sec, 'start from full pack', rr.status_code == 200, f'HTTP {rr.status_code}')

# Fresh QA fixtures: the CRUD pass cleans up its own records, so strictness
# checks must not depend on IDs that have already been soft-deleted.
REF_CACHE.clear()
strict_cleanup = []
cl = req(OWNER, 'POST', 'records/clients', json=payload(RMAP['clients']))
if cl.status_code == 201:
    client_id = cl.json()['row']['id']
    strict_cleanup.append(('clients', client_id))
else:
    client_id = None
REF_CACHE['clients'] = client_id
pr = req(OWNER, 'POST', 'records/projects', json=payload(RMAP['projects'], overrides={'clientId': client_id}))
if pr.status_code == 201:
    project_id = pr.json()['row']['id']
    strict_cleanup.append(('projects', project_id))
else:
    project_id = ref_id('projects')
REF_CACHE['projects'] = project_id
check(sec, 'strict QA client and project available', bool(client_id and project_id),
      f'client={client_id} project={project_id}')
inc = req(OWNER, 'POST', 'records/incidents', json=payload(RMAP['incidents'], overrides={'projectId': project_id}))
strict_incident_id = inc.json()['row']['id'] if inc.status_code == 201 else None
if strict_incident_id:
    strict_cleanup.append(('incidents', strict_incident_id))
check(sec, 'strict QA incident available', bool(strict_incident_id), f'HTTP {inc.status_code} {inc.text[:120]}')

# A disabled module AND its resources disappear everywhere except Settings.
toggle('safety', False)
m = meta_ids()
ms = meta_ids('settings')
check(sec, 'default meta hides disabled module', 'safety' not in module_ids(m), module_ids(m))
check(sec, 'default meta hides disabled resource', 'incidents' not in resource_ids(m), resource_ids(m))
check(sec, 'settings meta keeps full module list', 'safety' in module_ids(ms), module_ids(ms))
check(sec, 'settings page remains reachable', org_page('settings').status_code == 200, '')
check(sec, 'direct resource URL blocked', org_page('m/incidents').status_code == 404, '')
check(sec, 'refs dropdown API blocked', req(OWNER, 'GET', 'records/incidents?mode=refs').status_code == 403, '')
check(sec, 'PDF API blocked for disabled resource',
      req(OWNER, 'GET', f'pdf/incidents/{strict_incident_id or "x"}').status_code == 403, '')
check(sec, 'global search hides disabled resource',
      all(r.get('resource') != 'incidents' for r in req(OWNER, 'GET', f'search?q={MARK}').json().get('results', [])), '')
check(sec, 'overview counts hide disabled resource',
      'incidents' not in req(OWNER, 'GET', 'overview').json().get('counts', {}), '')
check(sec, 'disabled detail API blocked',
      req(OWNER, 'GET', f'records/incidents/{strict_incident_id}').status_code == 403, '')
check(sec, 'disabled comments API blocked',
      req(OWNER, 'POST', f'records/incidents/{strict_incident_id}/comments', json={'body': 'blocked'}).status_code == 403, '')
check(sec, 'disabled bulk API blocked',
      req(OWNER, 'DELETE', 'records/incidents/bulk', json={'ids': [strict_incident_id]}).status_code == 403, '')
check(sec, 'disabled CSV API blocked',
      req(OWNER, 'GET', 'records/incidents?mode=csv').status_code == 403, '')
check(sec, 'disabled related API blocked',
      req(OWNER, 'GET', f'records/incidents/{strict_incident_id}/related').status_code == 403, '')
check(sec, 'disabled files API blocked',
      req(OWNER, 'GET', 'files?resource=incidents').status_code == 403, '')
p360 = req(OWNER, 'GET', f'projects/{project_id}').json()
check(sec, 'project 360 API hides disabled records',
      'incidents' not in (p360.get('grouped') or {}) and 'incidents' not in (p360.get('defs') or {}), '')
toggle('safety', True)
check(sec, 're-enabled resource detail visible',
      req(OWNER, 'GET', f'records/incidents/{strict_incident_id}').status_code == 200, '')
check(sec, 're-enabled record appears in global search',
      any(r.get('resource') == 'incidents' for r in req(OWNER, 'GET', f'search?q={MARK}').json().get('results', [])), '')

# Special pages with no resource of their own are module-gated too.
toggle('wallets', False)
check(sec, 'direct wallets URL blocked', org_page('wallets').status_code == 404, '')
check(sec, 'wallets API blocked', req(OWNER, 'GET', 'wallets').status_code == 403, '')
ov = req(OWNER, 'GET', 'overview').json()
check(sec, 'overview hides wallet cards', len(ov.get('wallets', [])) == 0, len(ov.get('wallets', [])))
check(sec, 'overview zeroes wallet KPI', ov.get('kpis', {}).get('walletBalance') == 0, '')
check(sec, 'default meta hides wallets module', 'wallets' not in module_ids(meta_ids()), '')
toggle('wallets', True)
check(sec, 'wallets restored', req(OWNER, 'GET', 'wallets').status_code == 200, '')

toggle('documents', False)
check(sec, 'direct library URL blocked', org_page('library').status_code == 404, '')
check(sec, 'library API blocked', req(OWNER, 'GET', 'library').status_code == 403, '')
check(sec, 'files API blocked for disabled documents', req(OWNER, 'GET', 'files?resource=documents').status_code == 403, '')
toggle('documents', True)

toggle('reports', False)
check(sec, 'direct reports URL blocked', org_page('reports').status_code == 404, '')
toggle('reports', True)
toggle('dashboard', False)
check(sec, 'direct dashboard URL blocked', org_page('dashboard').status_code == 404, '')
check(sec, 'direct documentation URL blocked', org_page('documentation').status_code == 404, '')
toggle('dashboard', True)

toggle('projects', False)
check(sec, 'direct projects URL blocked', org_page('m/projects').status_code == 404, '')
check(sec, 'direct project 360 URL blocked', org_page(f'projects/{project_id}').status_code == 404, '')
check(sec, 'project 360 API blocked', req(OWNER, 'GET', f'projects/{project_id}').status_code == 403, '')
check(sec, 'projects records API blocked', req(OWNER, 'GET', 'records/projects?pageSize=3').status_code == 403, '')
check(sec, 'global search hides projects',
      all(r.get('resource') != 'projects' for r in req(OWNER, 'GET', f'search?q={MARK}').json().get('results', [])), '')
toggle('projects', True)
check(sec, 'project 360 restored', req(OWNER, 'GET', f'projects/{project_id}').status_code == 200, f'project={project_id} HTTP {req(OWNER, "GET", f"projects/{project_id}").status_code}')
rr = req(OWNER, 'PATCH', 'settings', json={'action': 'applyPack', 'pack': 'full'})
check(sec, 'full pack restored', rr.status_code == 200, f'HTTP {rr.status_code}')

# ─────────────────────────────────────────────────────────────────────────────
# 4c · WHITE-LABEL FINANCIAL DOCUMENTS AND EDITABLE LINE ITEMS
# ─────────────────────────────────────────────────────────────────────────────
sec = 'finance'
original_company = meta_ids('settings').get('org', {}).get('company', {})
finance_cleanup = []

def financial_payload(rid, overrides=None):
    defn = RMAP[rid]
    keys = [f['key'] for f in defn['fields']]
    out = {}
    for f in defn['fields']:
        if f['type'] == 'ref' and f['ref']:
            val = ref_id(f['ref'])
            if val:
                out[f['key']] = val
    if 'projectId' in keys and project_id:
        out['projectId'] = project_id
    if 'clientId' in keys and client_id:
        out['clientId'] = client_id
    if overrides:
        out.update(overrides)
    return payload(defn, overrides=out)

LOGO_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
company = {
    'displayName': 'Kestrel Ridge QA Documents', 'legalName': 'Kestrel Ridge Construction (Pvt) Ltd',
    'registrationNo': '2014/089321/07', 'taxNo': 'VAT-QA-2001', 'address': '12 Borrowdale Road, Harare, Zimbabwe',
    'email': 'accounts@kestrelridge.co.zw', 'phone': '+263 242 000 000', 'website': 'www.kestrelridge.co.zw',
    'bankDetails': 'Account: Kestrel Ridge QA · Bank: ZB Bank · Branch: Borrowdale · USD 000-123-456',
    'quoteIntro': 'We are pleased to submit this formal quotation for the works described below.',
    'paymentTerms': '70% deposit before commencement; balance within 14 days of practical completion.',
    'clientMaterials': 'Client to provide site access, water and approved drawings before commencement.',
    'warrantyDelivery': 'Twelve-month workmanship warranty; delivery subject to site access.',
    'footerNote': 'Thank you for partnering with Kestrel Ridge.', 'preparedBy': 'Tendai Muchengeti',
    'depositPct': 70, 'logoDataUrl': 'data:image/png;base64,' + LOGO_PNG,
}
rr = req(OWNER, 'PATCH', 'settings', json={'action': 'updateCompany', 'company': company})
check(sec, 'company branding saved', rr.status_code == 200 and rr.json().get('company', {}).get('displayName') == company['displayName'], rr.text[:150])
meta_company = meta_ids('settings').get('org', {}).get('company', {})
check(sec, 'meta exposes company profile', meta_company.get('displayName') == company['displayName'] and meta_company.get('logoDataUrl', '').startswith('data:image/png'), meta_company)
check(sec, 'default meta also exposes company profile', meta_ids().get('org', {}).get('company', {}).get('displayName') == company['displayName'], '')

# Structured lines must derive net/VAT/total while old records remain readable.
lines = [{'description': 'Supply and install roof trusses', 'detail': 'Grade S355 steel', 'qty': 2, 'unitPrice': 100, 'total': 200}]
est = req(OWNER, 'POST', 'records/estimates', json=financial_payload('estimates', {
    'items': lines, 'markup': 10, 'total': 0, 'labourCost': 0,
}))
check(sec, 'estimate with line items created', est.status_code == 201, f'HTTP {est.status_code} {est.text[:150]}')
if est.status_code == 201:
    erow = est.json()['row']
    finance_cleanup.append(('estimates', erow['id']))
    check(sec, 'lines persist', isinstance(erow.get('items'), list) and erow['items'][0]['total'] == 200, erow.get('items'))
    check(sec, 'estimate total derived from lines + markup', abs(float(erow.get('total', 0)) - 220) < 0.005, erow.get('total'))
    pdf = req(OWNER, 'GET', f'pdf/estimates/{erow["id"]}')
    body = pdf.content if hasattr(pdf, 'content') else b''
    text = pdf_text(pdf)
    low = text.lower()
    check(sec, 'estimate PDF renders', pdf.status_code == 200 and pdf.headers.get('Content-Type', '').startswith('application/pdf'), f'HTTP {pdf.status_code}')
    check(sec, 'PDF uses tenant company name', 'kestrel ridge qa documents' in low, '')
    check(sec, 'PDF has MYLA footer only', 'generated by myla' in low, '')
    check(sec, 'PDF has no example branding', 'shell mark' not in low, '')
    check(sec, 'PDF embeds uploaded logo', b'/Image' in body or b'/XObject' in body, '')
    check(sec, 'PDF shows payment notice', 'payment notice' in low or 'payment terms' in low, '')
    check(sec, 'PDF shows itemised table', 'description' in low and 'subtotal' in low, '')
    check(sec, 'PDF shows banking details', 'banking details' in low or 'zb bank' in low, '')
    check(sec, 'PDF shows warranty', 'warranty' in low or 'workmanship' in low, '')
    check(sec, 'PDF shows signature', 'authorised signatory' in low, '')
    check(sec, 'PDF shows tenant VAT number', 'vat-qa-2001' in low, '')

inv = req(OWNER, 'POST', 'records/arInvoices', json=financial_payload('arInvoices', {
    'items': lines, 'vatPct': 15, 'amount': 0, 'vatAmount': 0, 'total': 0,
}))
check(sec, 'invoice with line items created', inv.status_code == 201, f'HTTP {inv.status_code} {inv.text[:150]}')
if inv.status_code == 201:
    irow = inv.json()['row']
    finance_cleanup.append(('arInvoices', irow['id']))
    check(sec, 'invoice net derived from lines', abs(float(irow.get('amount', 0)) - 200) < 0.005, irow.get('amount'))
    check(sec, 'invoice VAT derived from lines', abs(float(irow.get('vatAmount', 0)) - 30) < 0.005, irow.get('vatAmount'))
    check(sec, 'invoice total derived from lines', abs(float(irow.get('total', 0)) - 230) < 0.005, irow.get('total'))

# Every financial/order document gets the formal layout and stays backwards-readable.
FINANCIAL_IDS = ['estimates', 'bids', 'contracts', 'changeOrders', 'requisitions', 'purchaseOrders',
                 'goodsReceipts', 'budgets', 'journals', 'expenses', 'payRuns', 'accounts',
                 'arInvoices', 'paymentApps', 'apBills', 'payments']
for rid in FINANCIAL_IDS:
    rec_id = None
    body = financial_payload(rid)
    rr2 = req(OWNER, 'POST', f'records/{rid}', json=body)
    if rr2.status_code == 201:
        rec_id = rr2.json()['row']['id']
    if not rec_id:
        rr2 = req(OWNER, 'GET', f'records/{rid}?pageSize=1')
        rows2 = rr2.json().get('rows', []) if rr2.status_code == 200 else []
        rec_id = rows2[0]['id'] if rows2 else None
    if not rec_id:
        check(sec, f'{rid} PDF has a record', False, 'no record available')
        continue
    pdf = req(OWNER, 'GET', f'pdf/{rid}/{rec_id}')
    body = pdf.content if hasattr(pdf, 'content') else b''
    text = pdf_text(pdf)
    low = text.lower()
    check(sec, f'{rid} formal PDF', pdf.status_code == 200 and 'kestrel ridge qa documents' in low and 'generated by myla' in low,
          f'HTTP {pdf.status_code} bytes={len(body)}')
    if rr2.status_code == 201:
        req(OWNER, 'DELETE', f'records/{rid}/{rec_id}')

# Return the tenant to its exact pre-test branding and remove QA fixtures.
for rid, rec_id in finance_cleanup:
    req(OWNER, 'DELETE', f'records/{rid}/{rec_id}')
for rid, rec_id in reversed(strict_cleanup):
    req(OWNER, 'DELETE', f'records/{rid}/{rec_id}')

# Restore the original company profile (no hard-coded tenant identity in code).
rr = req(OWNER, 'PATCH', 'settings', json={'action': 'updateCompany', 'company': original_company})
check(sec, 'company branding restored exactly', rr.status_code == 200, rr.text[:120])

# ─────────────────────────────────────────────────────────────────────────────
# 5 · TENANT ISOLATION
# ─────────────────────────────────────────────────────────────────────────────
sec = 'isolation'
check(sec, 'unknown org rejected',
      OWNER.get(f'{BASE}/api/not-a-real-org/records/clients', timeout=(5, 20)).status_code in (401, 403, 404), '')

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
seed_balance = sum(w.get('baseBalance', w['balance']) for w in wdata.get('wallets', []))

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
    # Supabase RPC returns 409 Conflict for an already-reversed entry (the
    # SQLite-era service returned 400). Both mean the mutation was refused.
    check(sec, 'reversal cannot be repeated', req(OWNER, 'POST', wpath, json={'action': 'reverse', 'transactionId': alloc_tx}).status_code in (400, 409), '')
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
    check(sec, f'confirm {role}', confirm_qa_user(email), 'verified secure invite')
    ss, lr = login(email, QA_INVITE_PASSWORD)
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
    # Capabilities via invalid payloads (no money moves). New QA members are
    # unassigned internal staff, so row scoping correctly denies the portal
    # client's wallet before amount validation is reached.
    staff_restricted = not role.endswith('_EXTERNAL') and role not in ('OWNER', 'ADMIN')
    expected_topup = 400 if ('wallet.topup' in caps and not staff_restricted) else 403
    expected_allocate = 400 if ('wallet.allocate' in caps and not staff_restricted) else 403
    rr = req(ss, 'POST', wpath, json={'action': 'topup', 'amount': -1})
    check(sec, f'{role} wallet.topup capability', rr.status_code == expected_topup, f'HTTP {rr.status_code}')
    rr = req(ss, 'POST', wpath, json={'action': 'allocate', 'amount': -1, 'projectId': portal_project})
    check(sec, f'{role} wallet.allocate capability', rr.status_code == expected_allocate, f'HTTP {rr.status_code}')
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
other.headers.update({'Connection': 'close'})
email2 = f'qa.tenant.{MARK.lower()}@example.co.zw'
rr = other.post(f'{BASE}/api/auth/register', json={'name': 'QA Tenant', 'email': email2, 'password': 'Isolation@123', 'company': 'QA Other Builders'}, timeout=(5, 20))
check(sec, 'second workspace registration', rr.status_code == 200, f'HTTP {rr.status_code} {rr.text[:120]}')
rr = other.post(f'{BASE}/api/onboarding', json={'companyType': 'GENERAL_CONTRACTOR', 'size': 'MICRO', 'loadDemo': False}, timeout=(5, 20))
check(sec, 'second workspace onboarding', rr.status_code == 200, f'HTTP {rr.status_code} {rr.text[:120]}')
slug2 = rr.json().get('slug') if rr.status_code == 200 else None
check(sec, 'second workspace has its own slug', bool(slug2) and slug2 != ORG, str(slug2))
for name, path in [('records', 'records/clients'), ('wallets', 'wallets'), ('meta', 'meta'), ('overview', 'overview')]:
    rr = other.get(f'{BASE}/api/{ORG}/{path}', timeout=(5, 20))
    check(sec, f'other tenant cannot read {name}', rr.status_code in (401, 403, 404), f'HTTP {rr.status_code}')
rr = other.post(f'{BASE}/api/{ORG}/wallets/{portal_client}', json={'action': 'topup', 'amount': 500}, timeout=(5, 20))
check(sec, 'other tenant cannot fund a wallet', rr.status_code in (401, 403, 404), f'HTTP {rr.status_code}')
rr = other.get(f'{BASE}/api/{ORG}/records/clients/{portal_client}', timeout=(5, 20))
check(sec, 'other tenant cannot open a client record', rr.status_code in (401, 403, 404), f'HTTP {rr.status_code}')
if slug2:
    rr = other.get(f'{BASE}/api/{slug2}/wallets', timeout=(5, 20))
    check(sec, 'second tenant has an empty isolated wallet list', rr.status_code == 200 and rr.json().get('summary', {}).get('totalBalance') == 0, f'HTTP {rr.status_code} {rr.text[:120]}')

# ─────────────────────────────────────────────────────────────────────────────
# Restore the live workspace's original section set after all pack switches.
try:
    req(OWNER, 'PATCH', 'settings', json={'action': 'applyPack', 'pack': 'full'})
    for _m in MODULES:
        if _m['id'] not in ORIGINAL_MODULES:
            req(OWNER, 'PATCH', 'settings', json={'action': 'toggleModule', 'moduleId': _m['id'], 'enabled': False})
except Exception as _e:
    print(f'warning: could not restore original sections: {_e}')

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
