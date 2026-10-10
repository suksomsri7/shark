#!/usr/bin/env bash
# C4.4-fix round 2 re-run after the M2 P2028 fix (visibility computed before the convert tx)
set -uo pipefail
cd "$(dirname "$0")/../../.."
R=.qc-shots/crm/c44f/r2b; mkdir -p "$R"
NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck > "$R/typecheck.log" 2>&1; echo "typecheck exit=$?" >> "$R/_summary.txt"
OUT="$R/suites" bash scripts/pending/c44f/run-suites.sh probe-1-convert probe-7-convert-visibility probe-r1 probe-6-account-party-match c1.4 c1.4 c1.3
QC_BASE=http://127.0.0.1:3218 OUT="$R/suites" bash scripts/pending/c44f/run-suites.sh c1.10
env -u DATABASE_URL -u DIRECT_URL pnpm fitness > "$R/fitness-nodb.log" 2>&1; echo "fitness-nodb exit=$?" >> "$R/_summary.txt"
bash scripts/qc3.sh pnpm fitness > "$R/fitness-db.log" 2>&1; echo "fitness-db exit=$?" >> "$R/_summary.txt"
echo ALLDONE >> "$R/_summary.txt"
