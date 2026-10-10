#!/usr/bin/env bash
# C5.5-fix2 ROUND 3 checks (QC3 · gate lock · one heavy job at a time) → /tmp/cf2-logs/reg4-*.log + reg4.summary
set -uo pipefail
cd /root/projects/shark-crm-cf2
D=/tmp/cf2-logs; SUM="$D/reg4.summary"; : > "$SUM"
r() { local name="$1"; shift; local log="$D/reg4-${name//\//_}.log"; "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(grep -E 'JSON_SUMMARY|🟢|🔴|✅ docs|exit=' "$log" | tail -1 | cut -c1-200)" >> "$SUM"; }
q() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
q pending/cf2/review/probe-cf2-review-r2
q qc-crm-c3.5
q qc-crm-c2.5
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r fitness bash scripts/iso.sh bash scripts/qc3.sh pnpm fitness
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r docs-crm bash scripts/iso.sh bash scripts/qc3.sh pnpm exec tsx scripts/gen-crm-api-docs.mts --check
echo ALLDONE >> "$SUM"
