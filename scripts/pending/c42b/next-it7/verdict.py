#!/usr/bin/env python3
"""c42b it7 — the verdict of ONE run over its per-role/per-chunk summaries (it5 RV-5/RV-9/RV-10 + re-review RVR-9, R4, R7).

usage: verdict.py "<glob of summary json>" [--out report.json] [--list-vacuous] [--waivers waivers.json]
                  [--combine-base "<glob of an earlier full run>"]

Pairing (RV-5): an absence "pass" (hidden row not found · customer lock-out of a staff page) counts only if, in the SAME run, a role that
should see the control FOUND it on the same page and viewport (presence f=True, h=False). Customer lock-out: a staff role loaded the
same page with HTTP < 400.
it7 (RVR-9 / R4 ruling 1): LOCKOUT-PAIRED — an unpaired hidden row whose hidden roles ALL got HTTP ≥ 400 for that page and viewport
(page-level key gate; the runner's VACUITY GUARD counted 0) is paired by the refusal itself: counted as passed, shown in its own column.
it7 (R4 ruling 2): WAIVED — an unpaired row listed in the waiver file (testid or page#testid → ruling id) stays a pass and is printed with
its ruling. Every other unpaired row is VACUOUS and FAILS the verdict.
it7 hard failures: restore / cleanup / verify / outboxUnsettled / fatal + pageErrors (error boundary on a page, server-log "⨯"/"[email"
lines of a page group) + tripwire (crm.email.sent, webhook delivery, LINE/push/SMS left SKIPPED, sent member mail, e-mailed in-app
notification, transport OpsEvent, payroll row).
--combine-base (R7 evidence 6): items of the base run whose page is NOT in this run are added (per page: pressed = presence − needs −
safety skips, passed = pressed − dead − wrongExpect − hiddenLeak − disabled − unpaired) — the combined table of run5 + the re-run.
Pass: passed == pressed · VACUOUS == 0 · every hard list empty.
"""
import glob, json, sys, collections
args = sys.argv[1:]
def opt(k):
    return args[args.index(k) + 1] if k in args else None
out, wfile, base_glob = opt('--out'), opt('--waivers'), opt('--combine-base')
skip = {out, wfile, base_glob}
files = sorted(f for a in args if not a.startswith('--') and a not in skip for f in glob.glob(a) if not f.endswith('-crash.json'))
if not files: sys.exit('no summaries')
WAIVE = json.load(open(wfile)) if wfile else {}
def waiver(page, tid):
    return WAIVE.get(f'{page}#{tid}') or WAIVE.get(tid)

def load(fs):
    return [(f, json.load(open(f))) for f in fs]
S = load(files)
pages_here = {ps['page'] for _, s in S for ps in s.get('pageStatus') or []} | {e['p'] for _, s in S for e in s.get('presence') or []}
B = load(sorted(f for f in glob.glob(base_glob) if not f.endswith('-crash.json'))) if base_glob else []

def analyse(SS, keep_page=lambda p: True):
    positives, page_ok, status = set(), set(), collections.defaultdict(list)
    for f, s in SS:
        for e in s.get('presence') or []:
            if not e['h'] and e['f']: positives.add((e['p'], e['t'], e['d']))
        for ps in s.get('pageStatus') or []:
            if ps.get('user') != 'customer' and (ps.get('status') or 0) and ps['status'] < 400: page_ok.add((ps['page'], ps['device']))
            status[(ps['page'], ps['device'], ps.get('user'))].append(ps.get('status') or 0)
    refused = lambda p, d, u: bool(status.get((p, d, u))) and all(x >= 400 for x in status[(p, d, u)])
    # unpaired hidden rows grouped by (page, testid, device) → the hidden users
    unp = collections.defaultdict(list)
    for f, s in SS:
        for e in s.get('presence') or []:
            if not (e['h'] and not e['f']) or not keep_page(e['p']): continue
            paired = (e['p'], e['d']) in page_ok if e['t'] == '(page)' else (e['p'], e['t'], e['d']) in positives
            if not paired: unp[(e['p'], e['t'], e['d'])].append((e['u'], f.split('/')[-1]))
    cls = {}
    for (p, t, d), us in unp.items():
        if t != '(page)' and all(refused(p, d, u) for u, _ in us): cls[(p, t, d)] = 'LOCKOUT'
        elif waiver(p, t): cls[(p, t, d)] = 'WAIVED'
        else: cls[(p, t, d)] = 'VACUOUS'
    per = collections.defaultdict(collections.Counter)
    lists = collections.defaultdict(list)
    hard = collections.defaultdict(list)
    for f, s in SS:
        users = s.get('users') or ['?']; u = users[0] if len(users) == 1 else ','.join(users)
        c = per[u]
        whole = all(keep_page(p) for p in {e['p'] for e in s.get('presence') or []})
        if whole:
            c['pressed'] += s.get('total', 0); c['passed'] += s.get('passed', 0)
        else:  # per-page arithmetic for a base summary that mixes kept and replaced pages
            for e in s.get('presence') or []:
                if keep_page(e['p']): c['pressed'] += 1
            for b in ('skippedNeeds', 'skippedSafety'):
                c['pressed'] -= sum(1 for x in s.get(b) or [] if keep_page(x['page']))
        for b in ('dead', 'wrongExpect', 'hiddenLeak', 'vacuous', 'disabled', 'consoleErrors', 'overflow', 'skippedNeeds', 'skippedSafety', 'postChecked', 'dbVerified'):
            xs = [x for x in s.get(b) or [] if keep_page(x.get('page', ''))]
            c[b] += len(xs)
            if b in ('dead', 'wrongExpect', 'hiddenLeak', 'disabled'): lists[b] += [dict(x, user=u, summary=f.split('/')[-1]) for x in xs]
        for e in s.get('presence') or []:
            if not (e['h'] and not e['f']) or not keep_page(e['p']): continue
            k = cls.get((e['p'], e['t'], e['d']))
            if k == 'LOCKOUT': c['LOCKOUT-PAIRED'] += 1
            elif k == 'WAIVED': c['WAIVED'] += 1  # stays a pass, printed with its ruling
            elif k == 'VACUOUS':
                c['VACUOUS'] += 1
                if whole: c['passed'] -= 1
        if keep_page('*'):
            rf = sum(len(r.get('failed', [])) for r in s.get('restores') or [])
            if rf: hard['restoreFailures'].append(f"{f.split('/')[-1]}: {rf}")
            for k in ('cleanupFailures', 'outboxUnsettled', 'verifyFailures', 'tripwire'):
                for x in s.get(k) or []: hard[k].append(f"{f.split('/')[-1]}: {x}")
            if s.get('fatal'): hard['fatal'].append(f"{f.split('/')[-1]}: {str(s['fatal'])[:160]}")
        for x in s.get('pageErrors') or []:
            if keep_page(x['page']): hard['pageErrors'].append(f"{f.split('/')[-1]}: {x['page']} {x['user']} {x['device']} {x['kind']} — {x['detail'][:160]}")
    return per, cls, unp, hard, lists

per, cls, unp, hard, lists = analyse(S)
if B:
    # base run: only the pages this run did NOT cover; hard lists of the base are not re-counted (they belong to the base verdict)
    keep = lambda p: p != '*' and p not in pages_here
    bper, bcls, bunp, bhard, blists = analyse(B, keep)
    # per-page passed for the base = pressed − failures − unpaired (recomputed from its own counters)
    for u, c in bper.items():
        c['passed'] = c['pressed'] - c['dead'] - c['wrongExpect'] - c['hiddenLeak'] - c['disabled'] - c['VACUOUS']
        per[f'{u} (base)'].update(c)
    for k, v in bcls.items(): cls[k] = v; unp[k] = bunp[k]
    for k in ('pageErrors',):
        hard[k] += bhard.get(k, [])
    for b, xs in blists.items(): lists[b] += xs
tot = collections.Counter()
for c in per.values(): tot.update(c)
vac_n = sum(1 for k in cls if cls[k] == 'VACUOUS')
ok = tot['passed'] == tot['pressed'] and tot['VACUOUS'] == 0 and not any(hard.values()) \
    and not (tot['dead'] or tot['wrongExpect'] or tot['hiddenLeak'] or tot['disabled'])
print('| role | pressed | passed | dead | wrongExpect | hiddenLeak | vacuous(guard) | LOCKOUT-PAIRED | WAIVED | VACUOUS | disabled | needs | safety | dbVerified | postChecked |')
print('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
order = ['owner', 'manager', 'nok', 'thana', 'customer']
for u in sorted(per, key=lambda x: (order.index(x.split(' ')[0]) if x.split(' ')[0] in order else 9, x)):
    c = per[u]
    print(f"| {u} | {c['pressed']} | {c['passed']} | {c['dead']} | {c['wrongExpect']} | {c['hiddenLeak']} | {c['vacuous']} | {c['LOCKOUT-PAIRED']} | {c['WAIVED']} | {c['VACUOUS']} | {c['disabled']} | {c['skippedNeeds']} | {c['skippedSafety']} | {c['dbVerified']} | {c['postChecked']} |")
print(f"TOTAL pressed {tot['pressed']} · passed {tot['passed']} (incl. WAIVED {tot['WAIVED']}) · LOCKOUT-PAIRED {tot['LOCKOUT-PAIRED']} · VACUOUS {tot['VACUOUS']} items / {vac_n} rows · "
      + ' · '.join(f'{k} {len(v)}' for k, v in hard.items()))
print('VERDICT', 'PASS' if ok else 'FAIL', '' if ok else f"(passed {tot['passed']} vs pressed {tot['pressed']} · VACUOUS {tot['VACUOUS']}"
      + ''.join(f' · {k} {len(v)}' for k, v in hard.items() if v) + ')')
rows = collections.defaultdict(set)
for (p, t, d), k in cls.items(): rows[(k, p, t)].add(d)
if '--list-vacuous' in args:
    for (k, p, t), ds in sorted(rows.items()):
        users = sorted({u for d in ds for u, _ in unp[(p, t, d)]})
        print(f"  {k:8} {p} | {t} | {','.join(sorted(ds))} | {','.join(users)}" + (f" | {waiver(p, t)}" if k == 'WAIVED' else ''))
if out:
    json.dump({'perRole': {u: dict(c) for u, c in per.items()}, 'total': dict(tot), 'hard': hard,
               'unpaired': [{'class': k, 'page': p, 'testid': t, 'device': d, 'users': [u for u, _ in unp[(p, t, d)]], 'waiver': waiver(p, t)} for (p, t, d), k in sorted(cls.items())],
               'failures': lists, 'verdict': 'PASS' if ok else 'FAIL'}, open(out, 'w'), ensure_ascii=False, indent=1)
