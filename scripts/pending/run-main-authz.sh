#!/usr/bin/env bash
# controller: main gate for C5.5-authz-sweep (patch cf2 6280997b..5ebea63f onto session/crm after fix5) — static + QC3
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-authz.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
for m in crm member kanban account; do r "docs-$m" pnpm exec tsx scripts/gen-$m-api-docs.mts --check; done
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r fitness-qc3 bash scripts/qc3.sh pnpm fitness
q() { n=$1; shift; r "QC3 $n" env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q probe-cf8-mobile scripts/pending/cf8/probe-cf8-mobile.mts
q probe-cf8-actions scripts/pending/cf8/probe-cf8-actions.mts
q probe-cf8-review scripts/pending/cf8/review/probe-cf8-review.mts
q mobile-authz scripts/qc-mobile-authz-hotfix.mts
q automation-authz scripts/qc-automation-authz-hotfix.mts
q payment-authz scripts/qc-payment-authz-hotfix.mts
q probe-fix1 scripts/pending/c55/probe-fix1.mts
q crm-v1 scripts/qc-crm-v1.mts
q c0.2 scripts/qc-crm-c0.2.mts
q c1.11 scripts/qc-crm-c1.11.mts
q c1.6 scripts/qc-crm-c1.6.mts
echo ALLDONE >> "$L"
