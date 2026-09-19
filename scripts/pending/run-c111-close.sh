#!/usr/bin/env bash
# C1.11 controller verification + phase-C1 close (qc:all) — main tree = HEAD (C1.10 41c8d2a0) + C1.11 · QC1
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c111-close.log
: > "$L"
export CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "seed crm #1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed crm #2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
q qc-crm-c1.11
q qc-crm-v1
r "probe-c111-review" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c111-review.mts
r "probe-uiversion-gate (env unset)" env -u CRM_V2_SWITCH bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-uiversion-gate.mts
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=4096 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
for u in owner thana manager; do r "shots 1.11 $u" pnpm exec tsx scripts/visual-crm.mts 1.11 --user $u; done
r "serve stop"    bash scripts/acc-v2-serve.sh stop
r "QC:ALL"        pnpm qc:all
echo ALLDONE | tee -a "$L"
