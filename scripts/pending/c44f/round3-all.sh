#!/usr/bin/env bash
# C4.4-fix round 3: typecheck → probes + suites (QC3) → fitness ×2 → fresh :3218 build → journeys US2/3/8/10 → --clean → stop
set -uo pipefail
cd "$(dirname "$0")/../../.."
R=.qc-shots/crm/c44f/r3; mkdir -p "$R"
NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck > "$R/typecheck.log" 2>&1; echo "typecheck exit=$?" >> "$R/_summary.txt"
OUT="$R/suites" bash scripts/pending/c44f/run-suites.sh probe-1-convert probe-2-pipeline-quote-stages probe-3-company-doc-party probe-4-automation-company-deal probe-5-webhook-url probe-5b-webhook-loopback-e2e probe-7-convert-visibility probe-r1 c1.3 c1.4 c2.7 c3.5 qc-acc-v2-party c0.3
NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c44f-review/probe-r2.mts > "$R/suites/probe-r2.log" 2>&1; echo "probe-r2 exit=$? $(grep -a -E '🟢|🔴' "$R/suites/probe-r2.log" | tail -1)" >> "$R/_summary.txt"
env -u DATABASE_URL -u DIRECT_URL pnpm fitness > "$R/fitness-nodb.log" 2>&1; echo "fitness-nodb exit=$?" >> "$R/_summary.txt"
bash scripts/qc3.sh pnpm fitness > "$R/fitness-db.log" 2>&1; echo "fitness-db exit=$?" >> "$R/_summary.txt"
bash scripts/pending/c44f/serve-qc3.sh stop >/dev/null 2>&1
bash scripts/qc3.sh bash scripts/pending/c44f/serve-qc3.sh build > "$R/serve.out" 2>&1; echo "serve $(tail -1 "$R/serve.out")" >> "$R/_summary.txt"
QC_BASE=http://127.0.0.1:3218 WEBHOOK_ALLOW_PRIVATE=1 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts --journey US2,US3,US8,US10 > "$R/journeys.log" 2>&1; echo "journeys exit=$? $(grep -a JSON_SUMMARY "$R/journeys.log" | tail -1)" >> "$R/_summary.txt"
QC_BASE=http://127.0.0.1:3218 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts --clean > "$R/clean.log" 2>&1; echo "clean $(grep 'total rows' "$R/clean.log")" >> "$R/_summary.txt"
bash scripts/pending/c44f/serve-qc3.sh stop >> "$R/_summary.txt" 2>&1
echo ALLDONE >> "$R/_summary.txt"
