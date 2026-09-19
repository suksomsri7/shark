#!/usr/bin/env bash
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c18-build.log; : > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
r "typecheck" env NODE_OPTIONS=--max-old-space-size=4096 bash scripts/with-gate-lock.sh pnpm typecheck
r "BUILD+serve" env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
r "serve stop" bash scripts/acc-v2-serve.sh stop
echo ALLDONE | tee -a "$L"
