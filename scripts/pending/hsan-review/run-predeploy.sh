#!/usr/bin/env bash
# controller: pre-deploy regression for hotfix/sanitize-2026-10-01 (tip 0b7e7285) on QC3 — the "controller must run on a QC DB" list + the 4 hotfix suites + pure checks
set -uo pipefail
cd /root/projects/shark-crm-hsan
L=.qc-shots/predeploy.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
q() { r "QC3 $1" env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r judge-selftest pnpm exec tsx scripts/pending/hsan-review/judge-selftest.mts
r attack pnpm exec tsx scripts/pending/hsan-review/attack.mts vectors fuzz
for s in qc-sanitize-hotfix qc-automation-authz-hotfix qc-payment-authz-hotfix qc-mobile-authz-hotfix qc-kanban-k1.6 qc-kanban-k1.12 qc-kanban-k2.6 qc-kanban-k2.7 qc-kanban-k3.1 qc-kanban-k3.3 qc-kanban-k3.5 qc-kanban-k3.7 qc-kanban-k3.9 qc-member-m1.7 qc-member-m3.10 qc-member-m3.11 qc-member-public qc-crm-c2.5; do q "$s"; done
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
echo ALLDONE >> "$L"
