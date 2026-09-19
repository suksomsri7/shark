#!/bin/bash
cd /root/projects/shark-crm
L=.qc-shots/crm/c19-shots2.log; : > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
r "serve start" bash scripts/acc-v2-serve.sh start
for u in manager; do r "shots $u" pnpm exec tsx scripts/visual-crm.mts 1.9 --user $u; done
r "serve stop" bash scripts/acc-v2-serve.sh stop
echo ALLDONE | tee -a "$L"
