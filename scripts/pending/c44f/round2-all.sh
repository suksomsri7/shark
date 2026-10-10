#!/usr/bin/env bash
# C4.4-fix round 2: typecheck → probes + CRM suites + account suites (QC3) → fitness ×2 · logs .qc-shots/crm/c44f/r2/
set -uo pipefail
cd "$(dirname "$0")/../../.."
R=.qc-shots/crm/c44f/r2; mkdir -p "$R"
NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck > "$R/typecheck.log" 2>&1; echo "typecheck exit=$?" >> "$R/_summary.txt"
OUT="$R/suites" bash scripts/pending/c44f/run-suites.sh probe-1-convert probe-2-pipeline-quote-stages probe-3-company-doc-party probe-4-automation-company-deal probe-5-webhook-url probe-5b-webhook-loopback-e2e probe-6-account-party-match probe-7-convert-visibility probe-r1 \
  c1.3 c1.4 c1.5 c1.8 c1.10 c2.1 c2.7 c2.9 c3.2 c3.5 c3.8 \
  qc-account-deep qc-account-qc7 qc-account-cpa qc-acc-v2-payments qc-acc-v2-detail qc-acc-v2-groups qc-account-api-write-payments
env -u DATABASE_URL -u DIRECT_URL pnpm fitness > "$R/fitness-nodb.log" 2>&1; echo "fitness-nodb exit=$?" >> "$R/_summary.txt"
bash scripts/qc3.sh pnpm fitness > "$R/fitness-db.log" 2>&1; echo "fitness-db exit=$?" >> "$R/_summary.txt"
echo ALLDONE >> "$R/_summary.txt"
