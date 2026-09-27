# merge discover-owner-*.json chunks → opener proposals for registry rows (owner) — prints proposals + unresolved
import json, glob, fnmatch, sys, re
reg = json.load(open('scripts/crm-ui-inventory.json'))
rows = reg['rows']
label = sys.argv[1] if len(sys.argv) > 1 else 'disc1'
groups = []
for f in sorted(glob.glob(f'.qc-shots/c42/{label}-discover-owner-*.json')):
    groups += json.load(open(f))['groups']
def m(pat, t): return fnmatch.fnmatchcase(t, pat) if '*' in pat else pat == t
bypage = {}
for g in groups: bypage.setdefault(g['page'], {})[g['device']] = g
props = {}; unresolved = []; already = 0
for i, r in enumerate(rows):
    if 'owner' not in r['roles'] or 'owner' in r['hiddenFor']: continue
    G = bypage.get(r['page'])
    if not G: continue
    names = r.get('only') or [r['testid']]
    nots = [] if r.get('only') else r.get('not', [])
    best = {}
    for dev, g in G.items():
        V0 = g['V0']
        vis = any(any(m(n, t) and t not in nots for t in V0) for n in names)
        if vis: best[dev] = []; continue
        cands = [e for e in g['entries'] if not e.get('err') and any(any(m(n, t) and t not in nots for t in e['revealed']) for n in names)]
        if not cands: best[dev] = None; continue
        cands.sort(key=lambda e: (len(e['chain']), len(e['revealed'])))
        best[dev] = cands[0]['chain']
    if all(v == [] for v in best.values()): already += 1; continue
    d, mo = best.get('desktop'), best.get('mobile')
    chain = d if d else mo  # d == [] (visible on desktop) → use mobile chain; runner presses only when needed
    if d == [] and mo: chain = mo
    if chain in (None, []):
        unresolved.append((i, r['page'], r['testid'], r['kind'], r['expect']['type'], str(best)))
    else:
        props[i] = {'chain': chain, 'desktop': d, 'mobile': mo}
print(f'visible-already {already} · proposals {len(props)} · unresolved {len(unresolved)}')
json.dump({str(k): v for k, v in props.items()}, open(f'.qc-shots/c42/{label}-proposals.json', 'w'), ensure_ascii=False, indent=1)
for k, v in props.items():
    r = rows[k]; flag = '' if (v['desktop'] in (None, []) or v['mobile'] in (None, []) or v['desktop'] == v['mobile']) else '  ⚠️ desktop≠mobile ' + str(v)
    print('P', r['page'], '|', r['testid'], '<=', ' > '.join(v['chain']), flag)
for u in unresolved: print('U', *u, sep=' | ')
