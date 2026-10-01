#!/usr/bin/env bash
# controller: fix1 gate part 2 — the two suites that cannot run on QC3: c5.3 (QC2-pinned) and account-api-webhooks (needs the N migration; QC2 has it)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-fix1b.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
q() { n=$1; shift; r "QC2 $n" env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
r "QC2 migrate status" bash scripts/qc2.sh bash scripts/qc-prisma.sh migrate status
q "c5.3 L1,L3" scripts/qc-crm-c5.3.mts --only=L1,L3
q account-api-webhooks scripts/qc-account-api-webhooks.mts
echo ALLDONE >> "$L"
