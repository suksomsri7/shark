#!/usr/bin/env bash
# C5.5-fix1 ROUND 2 review reruns — QC3 only · one job at a time under the gate lock · logs /tmp/c55-logs/review-r2/
set -uo pipefail
cd /root/projects/shark-crm-c54e
D=/tmp/c55-logs/review-r2; mkdir -p "$D"
q3() { local n="$1"; shift; bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@" > "$D/$n.log" 2>&1; echo "$n exit=$? · $(grep -aE '🟢|🔴|ผ่าน [0-9]+/[0-9]+' "$D/$n.log" | tail -1 | cut -c1-200)" >> "$D/SUMMARY"; }
: > "$D/SUMMARY"
q3 probe-review-r2-run2 scripts/pending/c55/review-r2/probe-review-r2.mts
q3 qc-webhook-ui scripts/qc-webhook-ui.mts
q3 qc-account-api-webhooks scripts/qc-account-api-webhooks.mts
echo ALLDONE >> "$D/SUMMARY"
