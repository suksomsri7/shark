#!/usr/bin/env python3
"""READ-ONLY (C4.2 re-review after run5): classify every dbVerified row of run5 by the strength of its DB-effect check,
re-implementing the frozen runner's parseDbClauses/modelWritesOf (qc-crm-buttons.mts 7ecf3092 l.1659-1702).
strength: COUNT (parsed ±1 clause, scoped count before/after) > EQ (literal column on the detail entity) >
          AUDIT (an AuditLog action since the press — fails on a no-op only if the product audits only real changes) >
          ANYROW (any row of the model in the TENANT created/updated since the press — a concurrent write satisfies it) /
          DELETE (tenant count dropped)"""
import json, glob, re, sys, collections, random
REG = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'scripts/crm-ui-inventory.json'))
REG = REG['rows'] if isinstance(REG, dict) else REG
by = {}
for r in REG: by.setdefault((r['page'], r['testid']), r)
def parse(db):
    parsed = []; un = []
    for raw in [s.strip() for s in (db or '').split(' · ') if s.strip()]:
        m = re.match(r'^([A-Z][A-Za-z0-9]*)\s*\(?\s*\+1\b', raw)
        if m: parsed.append((m[1], 'inc')); continue
        m = re.match(r'^([A-Z][A-Za-z0-9]*)\s*[-−]1\b', raw)
        if m: parsed.append((m[1], 'dec')); continue
        m = re.match(r'^([A-Z][A-Za-z0-9]*)\.([A-Za-z0-9_]+)\s*=\s*([^\s(·]+)', raw)
        if m and not re.search(r'[<|>]', m[3]) and not re.match(r'^(now|Σ)', m[3]) and re.match(r'^(null|true|false|-?\d+(\.\d+)?|[A-Z][A-Z0-9_]*|["\'].*["\'])$', m[3]):
            parsed.append((m[1], 'eq')); continue
        un.append(raw)
    return parsed, un
rows = collections.Counter(); seen = {}
for f in sorted(glob.glob('/tmp/c42b-logs/run5-*-summary-*.json')):
    s = json.load(open(f))
    for e in s.get('dbVerified') or []:
        r = by.get((e['page'], e['testid']))
        db = (r or {}).get('expect', {}).get('db', '') if r else ''
        parsed, _ = parse(db)
        kinds = []
        if any(k in ('inc', 'dec') for _, k in parsed): kinds.append('COUNT')
        if any(k == 'eq' for _, k in parsed): kinds.append('EQ')
        ms = e['models']
        if any(m.startswith('AuditLog') for m in ms): kinds.append('AUDIT')
        if not parsed and any(not m.startswith('AuditLog') for m in ms):
            kinds.append('DELETE' if re.search(r'ถูกลบ|ลบแถว|แถวหาย|\bdeleted\b', db) else 'ANYROW')
        strongest = next((k for k in ('COUNT', 'EQ', 'DELETE', 'AUDIT', 'ANYROW') if k in kinds), '?')
        key = (e['page'], e['testid'])
        seen.setdefault(key, (strongest, kinds, ms, db, set()))[4].add(e['user'])
for k, v in seen.items(): rows[v[0]] += 1
print('distinct dbVerified rows by strongest check:', dict(rows), 'total', len(seen))
for (p, t), (st, kinds, ms, db, us) in sorted(seen.items(), key=lambda x: (x[1][0], x[0])):
    print(f"{st:7} {'+'.join(kinds):18} {p} #{t} [{','.join(sorted(us))}] models={ms} db={db[:110]}")
