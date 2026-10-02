#!/usr/bin/env python3
"""READ-ONLY (C4.2 it7 check): which REGISTERED controls share a JSX <form> with a guarded control (the it7 STRUCTURAL guard
refuses every press inside such a form). Static scan of the product source: for each guarded testid occurrence, find the enclosing
<form …>…</form> in the same file (balanced) and list the other data-testids inside it. usage: structural-guard-reach.py <src root>"""
import re, sys, os, json
root = sys.argv[1] if len(sys.argv) > 1 else '/root/projects/shark-crm-c54d/src'
G = ["crm-email-send", "crm-email-test-send", "portal-otp-request", "crm-email-composer", "deal-quote-btn", "deal-invoice-btn",
     "crm-commission-send-payroll", "pos-deal-select", "crm-card-scan", "crm-call-recording-input", "crm-call-ai-transcribe",
     "crm-files-input", "portal-slip-upload", "crm-files-open", "crm-email-domain-add", "portal-quote-confirm-submit",
     "portal-pay-promptpay", "portal-line-login", "crm-email-domain-refresh"]
TID = re.compile(r'data-testid\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|\{\s*`([^`]*)`\s*\})')
reg = {r['testid'] for r in json.load(open('scripts/pending/c42b/next-it7/crm-ui-inventory.json'))['rows']}
def forms(src):
    out = []; stack = []
    for m in re.finditer(r'<form\b|</form>', src):
        if m.group(0) == '</form>':
            if stack: out.append((stack.pop(), m.end()))
        else: stack.append(m.start())
    return out
for dp, _, fs in os.walk(root):
    for f in fs:
        if not f.endswith(('.tsx', '.ts')): continue
        p = os.path.join(dp, f); s = open(p, encoding='utf8', errors='ignore').read()
        if 'data-testid' not in s or '<form' not in s: continue
        spans = forms(s)
        for g in G:
            for m in re.finditer(re.escape(g) + r'["`]', s):
                for a, b in spans:
                    if a <= m.start() <= b:
                        inside = sorted({re.sub(r'\$\{[^}]*\}', '*', next(x for x in t.groups() if x is not None)) for t in TID.finditer(s[a:b])})
                        others = [t for t in inside if t != g]
                        print(f"{g} in <form> {os.path.relpath(p, root)}:{s[:a].count(chr(10))+1} → also: {', '.join(others) or '-'}")
                        print(f"   registered others: {', '.join(t for t in others if t in reg) or '-'}")
