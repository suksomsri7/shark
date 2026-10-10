#!/usr/bin/env bash
# controller: MAIN gate for batch C5.4-C round 5 (merged onto 986ec608) · all on QC2 (same list as builder run5) · 28 Sep
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-c.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; echo "exit=$?" >> "$L"; }
q() { r "$*" bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q scripts/pending/hunt-54c/probe-family.mts
q scripts/pending/hunt-54c/probe-hunt.mts
q scripts/pending/hunt-54c/probe-race.mts
q scripts/pending/c54c/probe-cn.mts
q scripts/pending/c54c/backfill-invoice-status.mts
q scripts/qc-crm-c5.3.mts --only=L2,X
for f in qc-crm-c3.3 qc-crm-c2.7 qc-account-qc7 qc-account-cpa qc-acc-v2-adjust qc-acc-v2-payments qc-account-api-write-payments qc-account-api-webhooks qc-acc-v2-groups qc-acc-v2-detail qc-account-deep qc-acc-v2-promptpay qc-crm-c3.1 qc-crm-c3.2 qc-crm-c3.5 qc-crm-c1.4 qc-crm-c2.11 qc-hr-payadjust qc-payroll qc-payroll-reverse; do q scripts/$f.mts; done
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r fitness pnpm fitness
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
echo ALLDONE >> "$L"
