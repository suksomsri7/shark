#!/usr/bin/env bash
# controller: main gate for C5.5-fix1 (patch c54e 288cca97..bc399d5d onto session/crm after D2+N) — static: typecheck · docs ×4 · fitness ×2
#   DB (QC3 — QC1 is held by button run3; own-fixture suites only): probe-fix1 · probe-idem · probe-auto · c0.2 · c1.10 · c2.9 · c5.3 L1,L3 (ORACLE-EDIT L3-m1) · qc-webhook · qc-webhook-ui · account-api-webhooks
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-fix1.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
for m in crm member kanban account; do r "docs-$m" pnpm exec tsx scripts/gen-$m-api-docs.mts --check; done
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r fitness-qc3 bash scripts/qc3.sh pnpm fitness
q() { n=$1; shift; r "QC3 $n" env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q probe-fix1 scripts/pending/c55/probe-fix1.mts
q probe-idem scripts/pending/c55/probe-idem.mts
q probe-auto scripts/pending/c55/probe-auto.mts
q c0.2 scripts/qc-crm-c0.2.mts
q c1.10 scripts/qc-crm-c1.10.mts
q c2.9 scripts/qc-crm-c2.9.mts
q "c5.3 L1,L3" scripts/qc-crm-c5.3.mts --only=L1,L3
q qc-webhook scripts/qc-webhook.mts
q qc-webhook-ui scripts/qc-webhook-ui.mts
q account-api-webhooks scripts/qc-account-api-webhooks.mts
echo ALLDONE >> "$L"
