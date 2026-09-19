#!/bin/bash
cd /root/projects/shark-crm
L=.qc-shots/crm/c19-final.log; : > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
r "typecheck" bash scripts/with-gate-lock.sh env NODE_OPTIONS=--max-old-space-size=4096 pnpm typecheck
r "qc-crm-c1.9" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c1.9.mts
r "probe-c19-review" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c19-review.mts
r "BUILD+serve" env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
for u in owner manager; do r "shots $u" pnpm exec tsx scripts/visual-crm.mts 1.9 --user $u; done
r "serve stop" bash scripts/acc-v2-serve.sh stop
echo ALLDONE | tee -a "$L"
