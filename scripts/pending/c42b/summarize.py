#!/usr/bin/env python3
"""C4.2 it4 (c42b) — tally + triage list from the runner's per-chunk summaries.

usage: summarize.py <glob of summary json…> [--list dead|wrongExpect|hiddenLeak|vacuous|skippedNeeds|consoleErrors|overflow] [--user u]
Tally per user × device: pressed (= total incl. hidden checks) · passed · dead · leak · fail (wrongExpect) · vacuous ·
skippedNeeds · skippedSafety · console · overflow · restoreFail.
"""
import glob, json, sys, collections
args = sys.argv[1:]
lst = args[args.index('--list') + 1] if '--list' in args else None
only = args[args.index('--user') + 1] if '--user' in args else None
files = []
for a in args:
    if a.startswith('--') or a in (lst, only):
        continue
    files += sorted(f for f in glob.glob(a) if not f.endswith('-crash.json'))  # it4-A: crashed-then-redone chunks are not counted
T = collections.defaultdict(collections.Counter)
items = []
for f in files:
    s = json.load(open(f))
    users = s.get('users') or ['?']
    # total/passed are not split per device in the summary — derive per (user, device) from the bucket lists + perPage
    for b in ('dead', 'wrongExpect', 'hiddenLeak', 'vacuous', 'consoleErrors', 'overflow', 'skippedNeeds', 'skippedSafety'):
        for x in s.get(b, []) or []:
            T[(x.get('user'), x.get('device'))][b] += 1
            if lst == b and (not only or x.get('user') == only):
                items.append((x.get('user'), x.get('device'), x.get('page'), x.get('testid'), (x.get('detail') or x.get('reason') or x.get('needs') or '')[:230], f.split('/')[-1]))
    for u in users:
        T[(u, '*')]['total'] += s.get('total', 0)
        T[(u, '*')]['passed'] += s.get('passed', 0)
        T[(u, '*')]['restoreFail'] += sum(len(r.get('failed', [])) for r in s.get('restores', []) or [])
        T[(u, '*')]['fatal'] += 1 if s.get('fatal') else 0
if lst:
    for it in sorted(items):
        print(' | '.join(str(x) for x in it))
    print(f'-- {len(items)} {lst}')
else:
    by_user = collections.defaultdict(collections.Counter)
    for (u, d), c in T.items():
        by_user[u].update(c)
    print('| role | pressed | passed | dead d/m | leak d/m | fail d/m | vacuous | needs d/m | safety | console | overflow | restoreFail | fatal |')
    print('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for u in sorted(by_user, key=lambda x: ['owner', 'manager', 'nok', 'thana', 'customer'].index(x) if x in ['owner', 'manager', 'nok', 'thana', 'customer'] else 9):
        c = by_user[u]
        dd = lambda b: f"{T[(u, 'desktop')][b]}/{T[(u, 'mobile')][b]}"
        print(f"| {u} | {c['total']} | {c['passed']} | {dd('dead')} | {dd('hiddenLeak')} | {dd('wrongExpect')} | {c['vacuous']} | {dd('skippedNeeds')} | {c['skippedSafety']} | {c['consoleErrors']} | {c['overflow']} | {c['restoreFail']} | {c['fatal']} |")
