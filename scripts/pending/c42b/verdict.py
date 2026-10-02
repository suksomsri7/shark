#!/usr/bin/env python3
"""c42b it5 — the verdict of ONE run over all its per-role/per-chunk summaries (RV-5/RV-9/RV-10).

usage: verdict.py "<glob of summary json>" [--out report.json] [--list-vacuous]

Pairing (RV-5, ruling it5 §3): an absence "pass" (hidden row not found · customer lock-out of a staff page) counts only if, in the
SAME run, a role that should see the control FOUND it on the same page and viewport (presence f=True, h=False — a found control that
was then safety-skipped still proves presence). For the customer lock-out, the positive control is a staff role that loaded the
same page with HTTP < 400. Unpaired ⇒ VACUOUS (moved out of `passed`).
Pass criteria (ruling it5 §9): passed == pressed · VACUOUS == 0 (or each one ruled) · restore/cleanup/verify failures 0 ·
outbox settled before every restore · no fatal.
"""
import glob, json, sys, collections
args = sys.argv[1:]
out = args[args.index('--out') + 1] if '--out' in args else None
files = sorted(f for a in args if not a.startswith('--') and a != out for f in glob.glob(a) if not f.endswith('-crash.json'))
if not files: sys.exit('no summaries')
S = [(f, json.load(open(f))) for f in files]
positives = set()
page_ok = set()
for f, s in S:
    for e in s.get('presence') or []:
        if not e['h'] and e['f']: positives.add((e['p'], e['t'], e['d']))
    for ps in s.get('pageStatus') or []:
        if ps.get('user') != 'customer' and (ps.get('status') or 0) and ps['status'] < 400: page_ok.add((ps['page'], ps['device']))
per = collections.defaultdict(collections.Counter)
vac = []
hard = collections.defaultdict(list)
for f, s in S:
    users = s.get('users') or ['?']; u = users[0] if len(users) == 1 else ','.join(users)
    c = per[u]
    c['pressed'] += s.get('total', 0); c['passed'] += s.get('passed', 0)
    for b in ('dead', 'wrongExpect', 'hiddenLeak', 'vacuous', 'disabled', 'consoleErrors', 'overflow', 'skippedNeeds', 'skippedSafety', 'postChecked', 'dbVerified'):
        c[b] += len(s.get(b) or [])
    for e in s.get('presence') or []:
        if not (e['h'] and not e['f']): continue
        paired = (e['p'], e['d']) in page_ok if e['t'] == '(page)' else (e['p'], e['t'], e['d']) in positives
        if not paired:
            c['VACUOUS'] += 1; c['passed'] -= 1
            vac.append({'page': e['p'], 'testid': e['t'], 'user': e['u'], 'device': e['d'], 'summary': f.split('/')[-1]})
    rf = sum(len(r.get('failed', [])) for r in s.get('restores') or [])
    if rf: hard['restoreFailures'].append(f"{f.split('/')[-1]}: {rf}")
    for k in ('cleanupFailures', 'outboxUnsettled', 'verifyFailures'):
        for x in s.get(k) or []: hard[k].append(f"{f.split('/')[-1]}: {x}")
    if s.get('fatal'): hard['fatal'].append(f"{f.split('/')[-1]}: {str(s['fatal'])[:160]}")
tot = collections.Counter()
for c in per.values(): tot.update(c)
ok = tot['passed'] == tot['pressed'] and not any(hard.values())
print('| role | pressed | passed | dead | wrongExpect | hiddenLeak | vacuous(guard) | VACUOUS(unpaired) | disabled | needs | safety | dbVerified | postChecked |')
print('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
for u in sorted(per, key=lambda x: ['owner', 'manager', 'nok', 'thana', 'customer'].index(x) if x in ['owner', 'manager', 'nok', 'thana', 'customer'] else 9):
    c = per[u]
    print(f"| {u} | {c['pressed']} | {c['passed']} | {c['dead']} | {c['wrongExpect']} | {c['hiddenLeak']} | {c['vacuous']} | {c['VACUOUS']} | {c['disabled']} | {c['skippedNeeds']} | {c['skippedSafety']} | {c['dbVerified']} | {c['postChecked']} |")
print(f"TOTAL pressed {tot['pressed']} · passed {tot['passed']} · VACUOUS {tot['VACUOUS']} · " + ' · '.join(f'{k} {len(v)}' for k, v in hard.items()) )
print('VERDICT', 'PASS' if ok else 'FAIL', '' if ok else f"(passed {tot['passed']} ≠ pressed {tot['pressed']}" + ''.join(f' · {k} {len(v)}' for k, v in hard.items() if v) + ')')
if '--list-vacuous' in args:
    for v in sorted({(x['page'], x['testid'], x['user'], x['device']) for x in vac}): print('  VACUOUS', ' | '.join(v))
if out:
    json.dump({'perRole': {u: dict(c) for u, c in per.items()}, 'total': dict(tot), 'hard': hard, 'vacuous': vac, 'verdict': 'PASS' if ok else 'FAIL'}, open(out, 'w'), ensure_ascii=False, indent=1)
