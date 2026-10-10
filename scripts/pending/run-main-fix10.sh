#!/usr/bin/env bash
# controller: main gate for C5.5-fix10 (patch cd2 ee40bfba..6cbb8f3c onto session/crm after fix11) — static + QC2
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-fix10.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r gen-crm-docs pnpm exec tsx scripts/gen-crm-api-docs.mts
for m in crm member kanban account; do r "docs-$m" pnpm exec tsx scripts/gen-$m-api-docs.mts --check; done
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r fitness-qc2 bash scripts/qc2.sh pnpm fitness
q() { n=$1; shift; r "QC2 $n" env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q probe-cf13-sweep scripts/pending/cf13/probe-cf13-sweep.mts
q probe-cf10 scripts/pending/cf10/probe-cf10.mts
q probe-cf10-review scripts/pending/cf10/review/probe-cf10-review.mts
q probe-cf7-review-r2 scripts/pending/cf7/review/probe-cf7-review-r2.mts
q probe-cf5 scripts/pending/cf5/probe-cf5.mts
q c1.5 scripts/qc-crm-c1.5.mts
q c1.4 scripts/qc-crm-c1.4.mts
q c1.3 scripts/qc-crm-c1.3.mts
q c1.9 scripts/qc-crm-c1.9.mts
q c1.10 scripts/qc-crm-c1.10.mts
q c2.2 scripts/qc-crm-c2.2.mts
q c2.10 scripts/qc-crm-c2.10.mts
q c2.11 scripts/qc-crm-c2.11.mts
q c3.1 scripts/qc-crm-c3.1.mts
q c3.2 scripts/qc-crm-c3.2.mts
q c3.4 scripts/qc-crm-c3.4.mts
q "c5.3 L1,L3" scripts/qc-crm-c5.3.mts --only=L1,L3
echo ALLDONE >> "$L"
