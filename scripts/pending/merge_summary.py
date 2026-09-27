# merge <label>-summary-N.json chunks → <label>-summary.json + a compact report
import json, glob, sys
from collections import Counter
label = sys.argv[1]
parts = [json.load(open(f)) for f in sorted(glob.glob(f'.qc-shots/c42/{label}-summary-*.json'))]
keys = ['dead', 'wrongExpect', 'hiddenLeak', 'consoleErrors', 'overflow', 'skippedNeeds', 'skippedSafety', 'restores']
out = {'label': label, 'chunks': len(parts), 'total': sum(p['total'] for p in parts), 'passed': sum(p['passed'] for p in parts)}
for k in keys: out[k] = [x for p in parts for x in p.get(k, [])]
out['dbCheckUnparsed'] = {}
for p in parts: out['dbCheckUnparsed'].update(p.get('dbCheckUnparsed', {}))
out['fatal'] = [p['fatal'] for p in parts if p.get('fatal')]
json.dump(out, open(f'.qc-shots/c42/{label}-summary.json', 'w'), ensure_ascii=False, indent=1)
print({k: (len(v) if isinstance(v, list) else v) for k, v in out.items() if k != 'dbCheckUnparsed'})
print('restore failures:', sum(len(r['failed']) for r in out['restores']))
for k in ['dead', 'wrongExpect']:
    print(f'--- {k} by reason')
    print(Counter((x['detail'][:70]) for x in out[k]).most_common(12))
    print(f'--- {k} by page')
    print(Counter(x['page'] for x in out[k]).most_common(40))
