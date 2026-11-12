#!/usr/bin/env python3
"""Structural 3-way merge of conflicted JSON files (git stages 1/2/3). Usage: json3way.py <file>... (run in the tree mid-merge).
dicts: key-wise; lists of dicts with an id-like key: union by key (ours order, then theirs-only); else: theirs if ours==base, ours if theirs==base, equal ok, otherwise CONFLICT (exit 2)."""
import json, subprocess, sys
from collections import OrderedDict
def stage(n, f):
    try: return json.loads(subprocess.check_output(["git", "show", f":{n}:{f}"]), object_pairs_hook=OrderedDict)
    except subprocess.CalledProcessError: return None
bad = []
def keyof(lst):
    for k in ("id", "key", "path", "route", "name"):
        if lst and all(isinstance(x, dict) and k in x for x in lst): return k
    return None
def merge(b, o, t, path):
    if o == t: return o
    if o == b: return t
    if t == b: return o
    if isinstance(o, dict) and isinstance(t, dict):
        b = b if isinstance(b, dict) else {}
        out = OrderedDict()
        for k in list(o.keys()) + [k for k in t.keys() if k not in o]:
            if k in o and k in t: out[k] = merge(b.get(k), o[k], t[k], path + "." + k)
            elif k in o:
                if k in b and b[k] == o[k]: continue  # theirs deleted
                out[k] = o[k]
            else:
                if k in b and b[k] == t[k]: continue  # ours deleted
                out[k] = t[k]
        return out
    if isinstance(o, list) and isinstance(t, list):
        k = keyof(o + t)
        if k:
            bm = {x[k]: x for x in (b or []) if isinstance(x, dict) and k in x}
            tm = {x[k]: x for x in t}; om = {x[k]: x for x in o}; out = []
            for x in o:
                if x[k] in tm: out.append(merge(bm.get(x[k]), x, tm[x[k]], f"{path}[{x[k]}]"))
                elif x[k] in bm and bm[x[k]] == x: continue
                else: out.append(x)
            for x in t:
                if x[k] not in om and not (x[k] in bm and bm[x[k]] == x): out.append(x)
            return out
        bl = b if isinstance(b, list) else []
        if all(not isinstance(x, (dict, list)) for x in o + t):
            out = [x for x in o if x in t or x not in bl]
            out += [x for x in t if x not in out and x not in bl]
            return out
    bad.append(path); return o
for f in sys.argv[1:]:
    b, o, t = stage(1, f), stage(2, f), stage(3, f)
    m = merge(b, o, t, "")
    raw = subprocess.check_output(["git", "show", f":2:{f}"]).decode()
    indent = 2
    for line in raw.splitlines()[1:3]:
        if line.startswith("\t"): indent = "\t"; break
        if line.startswith(" "): indent = len(line) - len(line.lstrip()); break
    open(f, "w").write(json.dumps(m, ensure_ascii=False, indent=indent) + "\n")
    print(f, "merged", ("CONFLICTS:" + ",".join(bad)) if bad else "clean"); 
sys.exit(2 if bad else 0)
