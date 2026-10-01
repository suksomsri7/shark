#!/usr/bin/env python3
"""c42b it4 — bring registry rows that main gained AFTER this lane's base into the lane registry (e.g. batch C5.4-E).

usage: python3 scripts/pending/c42b/merge-main-rows.py <main-commit> [--apply]
  base   = 46f952cc (this worktree's base) · ours = scripts/crm-ui-inventory.json (working copy)
  theirs = <main-commit>:scripts/crm-ui-inventory.json (read from /root/projects/shark-crm via git show — read-only)
Rows keyed by (page, testid), 3-way field by field:
  · row only in theirs (new on main)         → appended after the last row of the same page (else at the end)
  · row in base+theirs, theirs changed field → taken when ours did not change that field; both changed differently = CONFLICT
  · row removed on main (in base, not theirs) → reported, NOT removed automatically (F14.2 ghost-row check decides)
Dry by default (prints the plan, exit 1 on conflict). After --apply run, in this order:
  1. SWEEP_REG unset · pnpm exec tsx scripts/pending/c42b/registry-sweep.mts --apply   (hiddenFor of the NEW rows from the
     real permission model — §15 ruling (b); existing rows must print 0 changes)
  2. python3 scripts/pending/c42b/it4a-registry-edits.py scripts/crm-ui-inventory.json   (idempotent · expect 0 changes)
  3. pnpm exec tsx scripts/qc-crm-buttons.mts --dry   (exit 0 · opener problems 0)
Format roundtrip: json.dumps(indent=2, ensure_ascii=False) + "\\n" (byte-identical for untouched rows).
"""
import json, subprocess, sys

BASE = '46f952cc'
MAIN = '/root/projects/shark-crm'
OURS = '/root/projects/shark-crm-c42b/scripts/crm-ui-inventory.json'
args = [a for a in sys.argv[1:] if not a.startswith('--')]
if not args:
    sys.exit(__doc__)
theirs_rev, apply = args[0], '--apply' in sys.argv
show = lambda rev: json.loads(subprocess.check_output(['git', '-C', MAIN, 'show', f'{rev}:scripts/crm-ui-inventory.json']))
base, theirs = show(BASE), show(theirs_rev)
ours = json.load(open(OURS))
key = lambda r: (r['page'], r['testid'])
B = {key(r): r for r in base['rows']}
O = {key(r): r for r in ours['rows']}
MISSING = object()
MOVED = {('/deals', t): ('/deals/[dealId]', t) for t in (
    'deal-lost-cancel', 'deal-lost-confirm', 'deal-lost-note', 'deal-lost-reason',
    'deal-reopen-cancel', 'deal-reopen-confirm', 'deal-reopen-reason', 'deal-reopen-submit')}
added, changed, conflicts, removed = [], [], [], []
for t in theirs['rows']:
    k = key(t)
    if k not in B:
        if k in O:
            # lane only ADDED fields main's row lacks (e.g. it4a opener for the E rows) = already merged, not a conflict
            if O[k] != t and not all(O[k].get(f) == v for f, v in t.items()): conflicts.append(f'{k}: new on main AND in lane with different content')
            continue
        added.append(t); continue
    if k not in O and k in MOVED and MOVED[k] in O: k_o = MOVED[k]  # it4 moved 8 rows /deals → /deals/[dealId]
    elif k not in O:
        if t != B[k]: conflicts.append(f'{k}: changed on main but missing in lane')
        continue
    else: k_o = k
    b, o = B[k], O[k_o]
    for f in sorted(set(b) | set(t)):
        bv, tv, ov = b.get(f, MISSING), t.get(f, MISSING), o.get(f, MISSING)
        if tv == bv or tv == ov: continue
        if ov != bv: conflicts.append(f'{k}.{f}: main {tv!r} · lane {ov!r} (base {bv!r})'); continue
        changed.append((k_o, f, tv))
tk = {key(r) for r in theirs['rows']}
removed = [k for k in B if k not in tk]
print(f'main {theirs_rev}: +{len(added)} rows · {len(changed)} field changes · {len(removed)} removed on main · {len(conflicts)} conflicts')
for r in added: print('  + ', r['page'], r['testid'], r['kind'], 'roles', r.get('roles'), 'hiddenFor', r.get('hiddenFor'))
for k, f, v in changed: print('  ~ ', k, f, '→', '<field removed>' if v is MISSING else json.dumps(v, ensure_ascii=False)[:120])
for k in removed: print('  - (not auto-removed)', k)
for c in conflicts: print('  ✖ ', c)
if conflicts: sys.exit(1)
if apply:
    for k, f, v in changed:
        r = O[k]
        if v is MISSING: r.pop(f, None)
        else: r[f] = v
    rows = ours['rows']
    for r in added:
        last = max((i for i, x in enumerate(rows) if x['page'] == r['page']), default=len(rows) - 1)
        rows.insert(last + 1, r)
    open(OURS, 'w').write(json.dumps(ours, indent=2, ensure_ascii=False) + '\n')
    print(f'✍️  wrote {OURS} — now run the sweep, it4a-registry-edits.py and --dry (see header)')
