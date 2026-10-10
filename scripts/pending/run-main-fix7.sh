#!/usr/bin/env bash
# controller: main gate for C5.5-fix7 (patch cd2 fbd7ca2c..ee40bfba onto session/crm after fix6) — static + QC2 (+ c3.5 on QC3)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-fix7.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r gen-crm-docs pnpm exec tsx scripts/gen-crm-api-docs.mts
for m in crm member kanban account; do r "docs-$m" pnpm exec tsx scripts/gen-$m-api-docs.mts --check; done
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r fitness-qc2 bash scripts/qc2.sh pnpm fitness
q() { n=$1; shift; r "QC2 $n" env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q probe-cf10 scripts/pending/cf10/probe-cf10.mts
q probe-cf10-review scripts/pending/cf10/review/probe-cf10-review.mts
q probe-cf7 scripts/pending/cf7/probe-cf7.mts
q probe-cf7-r2 scripts/pending/cf7/probe-cf7-r2.mts
q probe-cf7-review-r2 scripts/pending/cf7/review/probe-cf7-review-r2.mts
q c1.4 scripts/qc-crm-c1.4.mts
q c1.5 scripts/qc-crm-c1.5.mts
q c1.9 scripts/qc-crm-c1.9.mts
q c1.10 scripts/qc-crm-c1.10.mts
q c1.11 scripts/qc-crm-c1.11.mts
r "QC3 c3.5" env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c3.5.mts
echo ALLDONE >> "$L"
