#!/usr/bin/env bash
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c13-build.log
: > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
for u in owner thana manager nok; do r "shots $u" pnpm exec tsx scripts/visual-crm.mts 1.3 --user $u; done
r "serve stop"    bash scripts/acc-v2-serve.sh stop
r "m1.9" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.9.mts
echo ALLDONE | tee -a "$L"
