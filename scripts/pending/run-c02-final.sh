#!/usr/bin/env bash
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c02-final.log
: > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
r "oracle c0.2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c0.2.mts
r "oracle c1.1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c1.1.mts
r "qc-crm"        bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm.mts
r "qc-ai-tools"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-ai-tools.mts
r "typecheck"     bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL pnpm fitness
r "m1.9"          bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.9.mts
echo ALLDONE | tee -a "$L"
