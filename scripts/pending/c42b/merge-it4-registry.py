#!/usr/bin/env python3
"""C4.2 it4 port — 3-way, row-by-row, field-by-field merge of the button registry.

base = 18feaa84 (where the it4 edits started) · head = 46f952cc (UI-fix batch: hiddenFor sweep,
new rows) · it4 = 14cfb52f (runner it4 registry: opener/needs/query/viewport/not/expect...).

Rule: a field changed by only one side takes that side; changed by both to different values = abort
(manual decision). Rows are keyed by (page, testid); it4 MOVED 8 rows /deals -> /deals/[dealId]
(MOVED below) — HEAD's edits on the base row are carried to the moved row. HEAD-only rows are kept
as-is. Output = scripts/crm-ui-inventory.json with HEAD's row order (+ moved rows in place).
Roundtrip format: json.dumps(indent=2, ensure_ascii=False) + "\n".
Inputs (not committed — 1.5 MB; regenerate before re-running):
  git show 18feaa84:scripts/crm-ui-inventory.json > scripts/pending/c42b/reg-base.json
  git -C /root/projects/shark-crm-c42 show 14cfb52f:scripts/crm-ui-inventory.json > scripts/pending/c42b/reg-it4.json
  git show 46f952cc:scripts/crm-ui-inventory.json > scripts/pending/c42b/reg-head.json
Already applied in WIP C4.2 it4 checkpoint (1 Oct) — re-running on today's registry would undo the sweep; it is history.
"""
import json, sys, os
D = os.path.dirname(os.path.abspath(__file__))
L = {n: json.load(open(os.path.join(D, f'reg-{n}.json'))) for n in ('base', 'it4', 'head')}
key = lambda r: (r['page'], r['testid'])
B = {key(r): r for r in L['base']['rows']}
I = {key(r): r for r in L['it4']['rows']}
MOVED = {('/deals', t): ('/deals/[dealId]', t) for t in (
    'deal-lost-cancel', 'deal-lost-confirm', 'deal-lost-note', 'deal-lost-reason',
    'deal-reopen-cancel', 'deal-reopen-confirm', 'deal-reopen-reason', 'deal-reopen-submit')}
MISSING = object()
out_rows, conflicts, stats = [], [], {'it4Fields': 0, 'headOnly': 0, 'moved': 0}
for h in L['head']['rows']:
    k = key(h)
    if k not in B:
        out_rows.append(h); stats['headOnly'] += 1; continue
    b = B[k]
    ik = MOVED.get(k, k)
    i = I[ik]
    if ik != k: stats['moved'] += 1
    merged = {}
    order = list(i.keys()) + [f for f in h.keys() if f not in i]
    for f in order:
        bv, hv, iv = b.get(f, MISSING), h.get(f, MISSING), i.get(f, MISSING)
        if f == 'page':
            v = iv  # moved rows take the it4 page
        elif hv == bv:
            v = iv
            if iv != bv: stats['it4Fields'] += 1
        elif iv == bv or iv == hv:
            v = hv
        else:
            conflicts.append((k, f, bv, hv, iv)); v = hv
        if v is not MISSING: merged[f] = v
    out_rows.append(merged)
if conflicts:
    for c in conflicts: print('CONFLICT', c, file=sys.stderr)
    sys.exit(1)
out = dict(L['head']); out['$fields'] = L['it4']['$fields']; out['rows'] = out_rows
assert len({key(r) for r in out_rows}) == len(out_rows)
p = os.path.join(D, '..', '..', 'crm-ui-inventory.json')
open(p, 'w').write(json.dumps(out, indent=2, ensure_ascii=False) + '\n')
print(json.dumps(stats), 'rows', len(out_rows))
