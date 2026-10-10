#!/usr/bin/env bash
# controller: main gate for C5.5-fix9 (patch c54d 8cc1778a..3e9930ec onto session/crm after G1) — static + QC3
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-fix9.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
for m in crm member kanban account; do r "docs-$m" pnpm exec tsx scripts/gen-$m-api-docs.mts --check; done
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r fitness-qc3 bash scripts/qc3.sh pnpm fitness
q() { n=$1; shift; r "QC3 $n" env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q probe-cf12-r2 scripts/pending/cf12/probe-cf12-r2.mts
q probe-cf12 scripts/pending/cf12/probe-cf12.mts
q probe-cf12-review-r2 scripts/pending/cf12/review/probe-cf12-review-r2.mts
q probe-cf12-review-chain scripts/pending/cf12/review/probe-cf12-review-chain.mts
q c3.9 scripts/qc-crm-c3.9.mts
q c3.5 scripts/qc-crm-c3.5.mts
q form scripts/qc-form.mts
q approval scripts/qc-approval.mts
echo ALLDONE >> "$L"
