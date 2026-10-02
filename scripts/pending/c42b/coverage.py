#!/usr/bin/env python3
"""c42b it4 phase B — coverage of C4.1 + C4.2 from run3 (full pass, build 09de6435) + run4 (changed surfaces, build ca78a54d).
A (page, testid, user, device) counts as NEVER PRESSED when every run that opened that page for that user listed it under
skippedNeeds / skippedSafety. Wholesale page skips (unresolvable placeholders) come from the --dry log. Writes the CSV given as argv[1]."""
import glob, json, re, csv, sys, collections
L = '/tmp/c42b-logs'
RUN4_STAFF = [r'^/companies', r'^/activities$', r'^/emails', r'^/settings/(api|automation|email)$', r'^/settings/(sequences|portal)',
              r'^/contacts$', r'^/contacts/new$', r'^/app/sys/\[id\]$', r'^/deals/new$', r'^/contacts/\[']
def load(pat):
    out = []
    for f in sorted(glob.glob(pat)):
        if f.endswith('-crash.json'): continue
        out.append(json.load(open(f)))
    return out
skips = {}  # run -> {(page,tid,user,dev): reason}
for run in ('run3', 'run4'):
    d = {}
    for s in load(f'{L}/{run}-*-summary-*.json'):
        for b in ('skippedNeeds', 'skippedSafety'):
            for x in s.get(b) or []:
                d[(x['page'], x['testid'], x['user'], x['device'])] = ('needs: ' if b == 'skippedNeeds' else 'safety: ') + (x.get('needs') or x.get('reason') or '')[:140]
    skips[run] = d
def run4_covers(page, user):
    return user == 'customer' or any(re.search(p, page) for p in RUN4_STAFF)
never = {}
for k, why in skips['run3'].items():
    page, tid, user, dev = k
    if user == 'customer': continue
    if run4_covers(page, user) and k not in skips['run4']: continue  # pressed in run4
    never[k] = why
for k, why in skips['run4'].items():
    if k[2] == 'customer': never[k] = why  # customer: run4 is the only full-pass coverage (run3 FATAL)
by_page = collections.defaultdict(lambda: collections.defaultdict(set))
for (page, tid, user, dev), why in never.items():
    by_page[page][(tid, why)].add(f'{user}/{dev[0]}')
w = csv.writer(open(sys.argv[1], 'w', newline=''))
w.writerow(['page', 'testid', 'who (user/d|m)', 'why never pressed (run3 ∧ run4)'])
for page in sorted(by_page):
    for (tid, why), who in sorted(by_page[page].items()):
        w.writerow([page, tid, ' '.join(sorted(who)), why])
cnt = collections.Counter(p for (p, t, u, d) in never)
rows_ = collections.Counter(p for (p, t) in {(p, t) for (p, t, u, d) in never})
print('never-pressed (row×user×device):', len(never), '· distinct rows:', len({(p, t) for (p, t, u, d) in never}))
for p in sorted(cnt): print(f'  {p}: {rows_[p]} rows · {cnt[p]} row×user×device')
