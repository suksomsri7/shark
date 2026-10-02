#!/usr/bin/env bash
# controller: main gate for C5.5-fix12 (patch cd2 6cbb8f3c..713fa29f onto session/crm after G3) — static + QC2
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-fix12.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
for m in crm member kanban account; do r "docs-$m" pnpm exec tsx scripts/gen-$m-api-docs.mts --check; done
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r fitness-qc2 bash scripts/qc2.sh pnpm fitness
q() { n=$1; shift; r "QC2 $n" env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
r "QC2 probe-cf16-vs-red3" env BASELINE=/tmp/cf16-logs/red3.dump.json CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf16/probe-cf16.mts
q probe-cf16-r2 scripts/pending/cf16/probe-cf16-r2.mts
q probe-cf16-r3 scripts/pending/cf16/probe-cf16-r3.mts
q probe-cf16-review scripts/pending/cf16/review/probe-cf16-review.mts
q probe-cf16-review-r2 scripts/pending/cf16/review/probe-cf16-review-r2.mts
q probe-cf13 scripts/pending/cf13/probe-cf13.mts
q probe-cf13-review scripts/pending/cf13/review/probe-cf13-review.mts
q probe-cf13-sweep scripts/pending/cf13/probe-cf13-sweep.mts
q probe-cf10 scripts/pending/cf10/probe-cf10.mts
q probe-cf10-review scripts/pending/cf10/review/probe-cf10-review.mts
q probe-cf7-review scripts/pending/cf7/review/probe-cf7-review.mts
q probe-cf7-review-r2 scripts/pending/cf7/review/probe-cf7-review-r2.mts
q probe-cf5 scripts/pending/cf5/probe-cf5.mts
q c1.3 scripts/qc-crm-c1.3.mts
q c1.4 scripts/qc-crm-c1.4.mts
q c1.7 scripts/qc-crm-c1.7.mts
q c1.10 scripts/qc-crm-c1.10.mts
q c1.11 scripts/qc-crm-c1.11.mts
q c2.4 scripts/qc-crm-c2.4.mts
q c2.2 scripts/qc-crm-c2.2.mts
q c3.4 scripts/qc-crm-c3.4.mts
q leftover-check scripts/pending/cf16/review/leftover-check.mts --clean
echo ALLDONE >> "$L"
