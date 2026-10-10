#!/usr/bin/env bash
# controller: main gate for C5.5-fix4 (patch cf2 5c87acc3..b8e8ad52 onto session/crm after fix3a) — static + QC3
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-fix4.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
for m in crm member kanban account; do r "docs-$m" pnpm exec tsx scripts/gen-$m-api-docs.mts --check; done
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r fitness-qc3 bash scripts/qc3.sh pnpm fitness
p() { n=$1; shift; r "pure $n" env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
p sanitize-hotfix scripts/qc-sanitize-hotfix.mts
p rv-cf4-sanitize scripts/pending/cf4/review/rv-cf4-sanitize.mts
q() { n=$1; shift; r "QC3 $n" env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q rv-cf4-db scripts/pending/cf4/review/rv-cf4-db.mts
q probe-cf4-ci scripts/pending/cf4/probe-cf4-ci.mts
q automation-authz scripts/qc-automation-authz-hotfix.mts
q payment-authz scripts/qc-payment-authz-hotfix.mts
q mobile-authz scripts/qc-mobile-authz-hotfix.mts
q probe-cf2 scripts/pending/cf2/probe-cf2.mts
q probe-fix1 scripts/pending/c55/probe-fix1.mts
q probe-c54e scripts/pending/c54e/probe-c54e.mts
q c2.5 scripts/qc-crm-c2.5.mts
q c3.5 scripts/qc-crm-c3.5.mts
q c1.7 scripts/qc-crm-c1.7.mts
q acc-contact-modal scripts/qc-acc-v2-contact-modal.mts
q acc-import scripts/qc-acc-v2-import.mts
echo ALLDONE >> "$L"
