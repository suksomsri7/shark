#!/usr/bin/env bash
# controller: main gate for C6.0 (origin/main merged into session/crm) + C6.1-LINKPOLICY — static + QC3 + QC2 (pinned)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-c60.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
for m in crm member kanban account; do r "docs-$m" pnpm exec tsx scripts/gen-$m-api-docs.mts --check; done
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r fitness-qc3 bash scripts/qc3.sh pnpm fitness
q() { n=$1; shift; r "QC3 $n" env CF9_OWNER_OUT=/tmp/main-c60-owner.json CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q2() { n=$1; shift; r "QC2 $n" env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q hf-apiv1-scope scripts/qc-hf-apiv1-scope.mts
q sanitize-hotfix scripts/qc-sanitize-hotfix.mts
q security-hotfix scripts/qc-security-hotfix.mts
q mobile-authz-hotfix scripts/qc-mobile-authz-hotfix.mts
q automation-authz-hotfix scripts/qc-automation-authz-hotfix.mts
q payment-authz-hotfix scripts/qc-payment-authz-hotfix.mts
q probe-c60-review scripts/pending/c60/review/probe-c60-review.mts
q probe-cf9-g1 scripts/pending/cf9/probe-cf9-g1.mts
q probe-cf14-g2 scripts/pending/cf14/probe-cf14-g2.mts
q probe-cf17-g3 scripts/pending/cf17/probe-cf17-g3.mts
q ai-tools scripts/qc-ai-tools.mts
q mobile-chat scripts/qc-mobile-chat.mts
q c2.5 scripts/qc-crm-c2.5.mts
q c3.8 scripts/qc-crm-c3.8.mts
q c3.9 scripts/qc-crm-c3.9.mts
q hf-inventory-atomic scripts/qc-hf-inventory-atomic.mts
q2 probe-linkpolicy scripts/pending/c61l/probe-linkpolicy.mts
q2 probe-linkpolicy-review scripts/pending/c61l/review/probe-linkpolicy-review.mts
q2 c2.6 scripts/qc-crm-c2.6.mts
q2 c2.11 scripts/qc-crm-c2.11.mts
q2 "c5.3 L4" scripts/qc-crm-c5.3.mts --only=L4
echo ALLDONE >> "$L"
