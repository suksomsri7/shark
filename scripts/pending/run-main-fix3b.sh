#!/usr/bin/env bash
# controller: main gate for C5.5-fix3b (patch cd2 7d5dc93f..87231b2f onto session/crm after fix4) — static + QC2
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-fix3b.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r gen-crm-docs pnpm exec tsx scripts/gen-crm-api-docs.mts
for m in crm member kanban account; do r "docs-$m" pnpm exec tsx scripts/gen-$m-api-docs.mts --check; done
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r fitness-qc2 bash scripts/qc2.sh pnpm fitness
q() { n=$1; shift; r "QC2 $n" env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q probe-cf5 scripts/pending/cf5/probe-cf5.mts
q probe-cf5-r2 scripts/pending/cf5/probe-cf5-r2.mts
q rv-cf5 scripts/pending/cf5/review/rv-cf5.mts
q rv-cf5-r2 scripts/pending/cf5/review/rv-cf5-r2.mts
q probe-cf3 scripts/pending/cf3/probe-cf3.mts
q webhook scripts/qc-webhook.mts
q account-api-webhooks scripts/qc-account-api-webhooks.mts
q c1.10 scripts/qc-crm-c1.10.mts
q c1.3 scripts/qc-crm-c1.3.mts
q c1.4 scripts/qc-crm-c1.4.mts
q c1.6 scripts/qc-crm-c1.6.mts
q c3.4 scripts/qc-crm-c3.4.mts
q3() { n=$1; shift; r "QC3 $n" env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q3 probe-cf2 scripts/pending/cf2/probe-cf2.mts
q3 c3.5 scripts/qc-crm-c3.5.mts
q3 c3.8 scripts/qc-crm-c3.8.mts
q3 c2.5 scripts/qc-crm-c2.5.mts
echo ALLDONE >> "$L"
