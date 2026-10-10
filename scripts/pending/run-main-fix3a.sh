#!/usr/bin/env bash
# controller: main gate for C5.5-fix3a (patch cd2 df289f81..55366aaf onto session/crm after fix2) — static + QC2 (has migrations 000001..000003)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-fix3a.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
for m in crm member kanban account; do r "docs-$m" pnpm exec tsx scripts/gen-$m-api-docs.mts --check; done
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r fitness-qc2 bash scripts/qc2.sh pnpm fitness
r "QC2 migrate status" bash scripts/qc2.sh bash scripts/qc-prisma.sh migrate status
q() { n=$1; shift; r "QC2 $n" env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q probe-cf3 scripts/pending/cf3/probe-cf3.mts
q probe-cf3-r2 scripts/pending/cf3/probe-cf3-r2.mts
q rv5-r2 scripts/pending/cf3/review/rv5-r2.mts
q check-jno-fns-r2 scripts/pending/c54n/check-jno-fns-r2.mts
q n-qc-numbering scripts/pending/c54n/qc-numbering.mts
q probe-fix1 scripts/pending/c55/probe-fix1.mts
q probe-cf2 scripts/pending/cf2/probe-cf2.mts
q "c5.3 L1,L3" scripts/qc-crm-c5.3.mts --only=L1,L3
q account-api-webhooks scripts/qc-account-api-webhooks.mts
q acc-v2-payments scripts/qc-acc-v2-payments.mts
echo ALLDONE >> "$L"
