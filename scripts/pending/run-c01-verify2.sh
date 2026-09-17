#!/usr/bin/env bash
# C0.1 final controller verification (after reviewer fixes) — no rebuild needed (src/ untouched)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c01-verify2.log
: > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
r "oracle c1.1"     bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c1.1.mts
r "qc-crm"          bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm.mts
r "qc-crm-activity" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-activity.mts
r "qc-member-m1.9"  bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.9.mts
r "typecheck"       bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"         pnpm fitness
r "fitness-noenv"   env -u DATABASE_URL pnpm fitness
r "serve start"     bash scripts/acc-v2-serve.sh start
for u in owner manager thana nok; do r "visual $u" pnpm exec tsx scripts/visual-crm.mts 0.1 --user "$u"; done
r "serve stop"      bash scripts/acc-v2-serve.sh stop
echo "ALLDONE" | tee -a "$L"
