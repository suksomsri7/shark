#!/usr/bin/env bash
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c05-m19-bisect4.log
: > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
seed() { r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts; r "seed crm" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts; }
echo "### J: cron then m3.3 then m1.9" | tee -a "$L"; seed; q qc-cron; q qc-member-m3.3; q qc-member-m1.9
echo "### K: cron then fix-s3 then m1.9" | tee -a "$L"; seed; q qc-cron; q qc-member-fix-s3; q qc-member-m1.9
echo ALLDONE | tee -a "$L"
