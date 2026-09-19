#!/usr/bin/env bash
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c110-verify2.log
: > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
q qc-crm-c0.2
q qc-crm-c1.9
r "seed acc-v2" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-acc-v2-qc.mts
q qc-acc-v2-permissions
q qc-crm-c1.10
q qc-member-m1.9
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=4096 bash scripts/with-gate-lock.sh pnpm typecheck
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
r "shots owner" pnpm exec tsx scripts/visual-crm.mts 1.10 --user owner
r "serve stop"    bash scripts/acc-v2-serve.sh stop
echo ALLDONE | tee -a "$L"
