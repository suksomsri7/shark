#!/usr/bin/env bash
# controller: MAIN gate for batch C5.4-C r5–r14 (patch c10ee3f9..63ea9f45 onto session/crm 46f952cc+) · QC2 list (= builder runs) + QC1 cheque suites · 1 Oct
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-c2.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
q() { r "$*" env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r docs-check pnpm docs --check
for p in scripts/pending/hunt-54c/probe-family.mts scripts/pending/hunt-54c/probe-hunt.mts scripts/pending/hunt-54c/probe-race.mts scripts/pending/c54c/probe-cn.mts scripts/pending/hunt-54c-r8/probe-r8.mts scripts/pending/hunt-54c-r9/probe-r9a.mts scripts/pending/hunt-54c-r9/probe-r9c.mts scripts/pending/hunt-54c-r9/probe-r9e.mts scripts/pending/hunt-54c-r10/probe-r10b.mts scripts/pending/hunt-54c-r10/probe-r10c.mts scripts/pending/hunt-54c-r11/probe-r11b.mts scripts/pending/hunt-54c-r11/probe-r11c.mts scripts/pending/hunt-54c-r12/probe-r12a.mts; do q "$p"; done
q scripts/qc-crm-c5.3.mts --only=L2,X
for f in qc-crm-c3.3 qc-crm-c2.7 qc-crm-c3.1 qc-crm-c3.2 qc-crm-c3.5 qc-account-qc7 qc-account-cpa qc-acc-v2-adjust qc-acc-v2-payments qc-account-api-write-payments qc-account-api-write-docs qc-account-api-webhooks qc-acc-v2-groups qc-acc-v2-detail qc-account-deep qc-acc-v2-cheap-routes qc-acc-v2-simplicity qc-crm-c1.4 qc-crm-c2.11 qc-hr-payadjust qc-payroll qc-payroll-reverse; do q "scripts/$f.mts"; done
r fitness pnpm fitness
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
# QC1 cheque suites from MAIN (acc-v2 seed lives on QC1)
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'); D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) for s in qc-acc-v2-wht-cheque qc-account-api-ai-skill qc-cheque-audit; do r "QC1 $s" env DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$s.mts"; done ;; *) echo "QC1 env missing" >> "$L";; esac
echo ALLDONE >> "$L"
