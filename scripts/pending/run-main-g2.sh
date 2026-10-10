#!/usr/bin/env bash
# controller: main gate for C5.5-G2 (patch cf2 be9c9658..608204d3 onto session/crm after fix10) — static + QC3
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-g2.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
for m in crm member kanban account; do r "docs-$m" pnpm exec tsx scripts/gen-$m-api-docs.mts --check; done
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r fitness-qc3 bash scripts/qc3.sh pnpm fitness
q() { n=$1; shift; r "QC3 $n" env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q probe-cf14-g2 scripts/pending/cf14/probe-cf14-g2.mts
q probe-cf14-g2-review scripts/pending/cf14/review/probe-cf14-g2-review.mts
q probe-cf9-g1 scripts/pending/cf9/probe-cf9-g1.mts
q probe-cf9-g1-r2 scripts/pending/cf9/probe-cf9-g1-r2.mts
q probe-cf9-g1-review-r2 scripts/pending/cf9/review/probe-cf9-g1-review-r2.mts
q probe-cf8-mobile scripts/pending/cf8/probe-cf8-mobile.mts
q probe-cf8-actions scripts/pending/cf8/probe-cf8-actions.mts
q mobile-authz scripts/qc-mobile-authz-hotfix.mts
q automation-authz scripts/qc-automation-authz-hotfix.mts
q payment-authz scripts/qc-payment-authz-hotfix.mts
q ai-automation scripts/qc-ai-automation.mts
q c3.4 scripts/qc-crm-c3.4.mts
q c1.7 scripts/qc-crm-c1.7.mts
q c2.11 scripts/qc-crm-c2.11.mts
q c0.2 scripts/qc-crm-c0.2.mts
q probe-cf13-sweep scripts/pending/cf13/probe-cf13-sweep.mts
echo ALLDONE >> "$L"
