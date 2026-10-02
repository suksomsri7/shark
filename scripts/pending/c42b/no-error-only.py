#!/usr/bin/env python3
"""c42b it5 (RV-3): mutation rows whose pass is still "no error only" — no parseable count/literal clause (parseDbClauses), no named
model the runner can see written (modelWritesOf: model with tenantId + updatedAt, "ถูกลบ" = count drop, "AuditLog <action>"),
and no POST_CHECKS entry. Mirrors qc-crm-buttons.mts. usage: no-error-only.py <registry> <runner> [out.csv]"""
import json, re, sys, glob, csv
reg, runner = sys.argv[1], sys.argv[2]
rows = json.load(open(reg))['rows']
models = {}
for f in glob.glob('prisma/schema/*.prisma'):
    for m in re.finditer(r'^model (\w+) \{(.*?)^\}', open(f).read(), re.S | re.M):
        body = m.group(2)
        models[m.group(1)] = {'tenant': re.search(r'^\s+tenantId\s', body, re.M) is not None, 'updated': re.search(r'^\s+updatedAt\s', body, re.M) is not None}
post = set(re.findall(r'POST_CHECKS\.set\("([^"]+)"', open(runner).read()))
def parsed(db):
    out = set(); un = []
    for raw in [x.strip() for x in (db or '').split(' · ') if x.strip()]:
        m = re.match(r'^([A-Z][A-Za-z0-9]*)\s*\(?\s*\+1\b', raw) or re.match(r'^([A-Z][A-Za-z0-9]*)\s*[-−]1\b', raw)
        if m: out.add(m.group(1)); continue
        m = re.match(r'^([A-Z][A-Za-z0-9]*)\.([A-Za-z0-9_]+)\s*=\s*([^\s(·]+)', raw)
        if m and not re.search('[<|>]', m.group(3)) and not re.match('^(now|Σ)', m.group(3)) and re.match(r'''^(null|true|false|-?\d+(\.\d+)?|[A-Z][A-Z0-9_]*|["'].*["'])$''', m.group(3)): out.add(m.group(1)); continue
    return out
def writes(db, seen):
    out = []
    for raw in [x.strip() for x in re.split(r' · |\s\+\s|, ', db or '') if x.strip()]:
        am = re.match(r'^AuditLog\s+([a-z][a-z0-9_.|]+[a-z0-9])', raw)
        if am: out.append('AuditLog ' + am.group(1)); continue
        m = re.match(r'^([A-Z][A-Za-z0-9]+)\b', raw)
        if not m or m.group(1) in seen or m.group(1) not in models or not models[m.group(1)]['tenant']: continue
        if re.search('ไม่เปลี่ยน|ไม่เพิ่ม|ไม่เขียน|ไม่ลบ', raw): continue
        dele = re.search('ถูกลบ|ลบแถว|แถวหาย|\\bdeleted\\b', raw)
        if not dele and not models[m.group(1)]['updated'] and m.group(1) != 'AppSystem' and not re.search('\\+|แถวใหม่|1 แถว|สร้าง|PENDING(?!\\s*→)', raw): continue
        out.append(m.group(1)); seen.add(m.group(1))
    return out
res = []
for r in rows:
    vs = [(r['expect'], r.get('roles'), '')] + [(v['expect'], v['roles'], v.get('name', '')) for v in r.get('variants') or []]
    for e, roles, vname in vs:
        if e.get('type') != 'mutation' or e.get('outcome') == 'refusal': continue
        p = parsed(e.get('db'))
        w = writes(e.get('db'), set(p))
        res.append({'page': r['page'], 'testid': r['testid'] + (f' [{vname}]' if vname else ''), 'kind': r['kind'], 'roles': ','.join(roles or []),
                    'parsed': ' '.join(sorted(p)), 'written': ' '.join(w), 'postCheck': 'yes' if r['testid'] in post else '', 'db': (e.get('db') or '')[:140]})
none = [x for x in res if not x['parsed'] and not x['written'] and not x['postCheck']]
print(f"mutation rows {len(res)} · with a DB-effect check {len(res) - len(none)} · no-error only {len(none)}")
if len(sys.argv) > 3:
    with open(sys.argv[3], 'w', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=list(res[0].keys())); w.writeheader(); w.writerows(none)
