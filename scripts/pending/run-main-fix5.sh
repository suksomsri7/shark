#!/usr/bin/env bash
# controller: main gate for C5.5-fix5 (patch cf2 b8e8ad52..4f6cbb9d onto session/crm after fix3b) — static + pure + QC3 + QC2
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-fix5.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r gen-crm-docs pnpm exec tsx scripts/gen-crm-api-docs.mts
for m in crm member kanban account; do r "docs-$m" pnpm exec tsx scripts/gen-$m-api-docs.mts --check; done
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r fitness-qc3 bash scripts/qc3.sh pnpm fitness
p() { n=$1; shift; r "pure $n" env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
p probe-cf6-linear scripts/pending/cf6/probe-cf6-linear.mts
p rv-cf6-fuzz scripts/pending/cf6/review/rv-cf6-fuzz.mts
p rv-cf6-r2-fuzz scripts/pending/cf6/review/rv-cf6-r2-fuzz.mts
p sanitize-hotfix scripts/qc-sanitize-hotfix.mts
q() { n=$1; shift; r "QC3 $n" env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q probe-cf6-db scripts/pending/cf6/probe-cf6-db.mts
q probe-cf6-r2 scripts/pending/cf6/probe-cf6-r2.mts
q rv-cf6-r2-db scripts/pending/cf6/review/rv-cf6-r2-db.mts
q rv-cf4-db scripts/pending/cf4/review/rv-cf4-db.mts
q probe-cf2 scripts/pending/cf2/probe-cf2.mts
q c2.5 scripts/qc-crm-c2.5.mts
q c2.11 scripts/qc-crm-c2.11.mts
q c2.4 scripts/qc-crm-c2.4.mts
q c2.0 scripts/qc-crm-c2.0.mts
q c2.6 scripts/qc-crm-c2.6.mts
q c3.5 scripts/qc-crm-c3.5.mts
q c1.7 scripts/qc-crm-c1.7.mts
q k1.6 scripts/qc-kanban-k1.6.mts
q host-routing scripts/qc-host-routing.mts
q2() { n=$1; shift; r "QC2 $n" env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q2 probe-cf5 scripts/pending/cf5/probe-cf5.mts
q2 rv-cf5-r2 scripts/pending/cf5/review/rv-cf5-r2.mts
q2 "c5.3 L1,L3" scripts/qc-crm-c5.3.mts --only=L1,L3
echo ALLDONE >> "$L"
