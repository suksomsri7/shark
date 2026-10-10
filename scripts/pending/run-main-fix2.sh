#!/usr/bin/env bash
# controller: main gate for C5.5-fix2 (patch cf2 8cf86985..278a2351 onto session/crm after N + fix1; ORACLE-EDIT C2.5-U.5 sha) — static + QC3 own-fixture suites (QC1 held by button run3)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-fix2.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r gen-crm-docs pnpm exec tsx scripts/gen-crm-api-docs.mts
for m in crm member kanban account; do r "docs-$m" pnpm exec tsx scripts/gen-$m-api-docs.mts --check; done
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r fitness-qc3 bash scripts/qc3.sh pnpm fitness
q() { n=$1; shift; r "QC3 $n" env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q probe-cf2 scripts/pending/cf2/probe-cf2.mts
q probe-cf2-review-r2 scripts/pending/cf2/review/probe-cf2-review-r2.mts
q probe-cf2-review-r3 scripts/pending/cf2/review/probe-cf2-review-r3.mts
q probe-fix1 scripts/pending/c55/probe-fix1.mts
q c2.5 scripts/qc-crm-c2.5.mts
q c3.5 scripts/qc-crm-c3.5.mts
q c1.7 scripts/qc-crm-c1.7.mts
q c1.11 scripts/qc-crm-c1.11.mts
q c2.6 scripts/qc-crm-c2.6.mts
q c3.9 scripts/qc-crm-c3.9.mts
q c0.2 scripts/qc-crm-c0.2.mts
q forms-notify scripts/qc-forms-notify.mts
echo ALLDONE >> "$L"
