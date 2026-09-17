#!/usr/bin/env bash
# C0.1 controller verification (MASTER-PLAN §5 steps 8–9): reseed → oracle → regressions → typecheck → fitness ×2
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c01-verify.log
: > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "reseed crm"    bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "oracle c1.1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c1.1.mts
r "qc-crm"        bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm.mts
r "qc-crm-activity" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-activity.mts
r "qc-member-m1.9"  bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.9.mts
r "typecheck"     bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL pnpm fitness
echo "ALLDONE" | tee -a "$L"
