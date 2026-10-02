#!/usr/bin/env python3
"""READ-ONLY (C4.2 re-review after run5): which registry items were never PRESSED by any visible role in run5
(found by no visible role, or found but safety-skipped everywhere), with the reason; mutation rows flagged; hidden-role
relevance (does the row hide from nok/thana/manager — i.e. is the item permission-relevant?)."""
import json, glob, collections, csv, sys
REG = json.load(open('scripts/crm-ui-inventory.json')); REG = REG['rows'] if isinstance(REG, dict) else REG
byk = {}
for r in REG: byk.setdefault((r['page'], r['testid']), r)
found = collections.defaultdict(set); planned = collections.defaultdict(set); safety = collections.defaultdict(set); needs = collections.defaultdict(list)
for f in sorted(glob.glob('/tmp/c42b-logs/run5-*-summary-*.json')):
    s = json.load(open(f))
    for e in s['presence']:
        if not e['h']:
            planned[(e['p'], e['t'])].add(e['u'])
            if e['f']: found[(e['p'], e['t'])].add((e['u'], e['d']))
    for e in s['skippedSafety']: safety[(e['page'], e['testid'])].add((e['user'], e['device']))
    for e in s['skippedNeeds']: needs[(e['page'], e['testid'])].append(e['needs'][:90])
out = []
for k in sorted(planned):
    pressed = found[k] - safety[k]
    if pressed: continue
    r = byk.get(k) or next((x for x in REG if x['page'] == k[0] and k[1] in (x.get('only') or [])), {})
    why = 'safety' if found[k] else ('needs' if needs.get(k) else 'not-found(no needs → dead?)')
    hid = r.get('hiddenFor') or []
    out.append((k[0], k[1], r.get('kind', '?'), r.get('expect', {}).get('type', '?'), why, ','.join(sorted(planned[k])), ','.join(hid), (needs.get(k) or [''])[0]))
w = csv.writer(sys.stdout)
w.writerow(['page', 'testid', 'kind', 'expect', 'why', 'visibleRolesPlanned', 'hiddenFor', 'needs'])
for o in out: w.writerow(o)
print(f"# never pressed in run5: {len(out)} items · mutation {sum(1 for o in out if o[3]=='mutation')} · by why {dict(collections.Counter(o[4] for o in out))} · planned items {len(planned)}", file=sys.stderr)
