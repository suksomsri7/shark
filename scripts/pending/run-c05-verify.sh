#!/usr/bin/env bash
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c05-verify.log
: > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "seed crm"      bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
q qc-crm-c0.5
for s in qc-crm-c0.4 qc-crm-c0.3 qc-crm-c0.2 qc-crm-c1.1 qc-cron qc-webhook qc-automation qc-member-m3.3 qc-member-fix-s3 qc-crm qc-crm-activity; do q "$s"; done
r "runner minute" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/crm-cron.mts minute
r "runner hourly" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/crm-cron.mts hourly
r "runner daily"  bash scripts/with-gate-lock.sh pnpm exec tsx scripts/crm-cron.mts daily
r "runner BAD (expect nonzero)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/crm-cron.mts bogus
r "typecheck"     bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL pnpm fitness
r "BUILD"         bash scripts/acc-v2-serve.sh
r "serve stop"    bash scripts/acc-v2-serve.sh stop
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
