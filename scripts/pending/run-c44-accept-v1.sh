#!/usr/bin/env bash
# controller: C4.4 acceptance on MAIN/QC1 · restore QC1 expected files → production build from HEAD + QC server (3215 · AI mock ·
# WEBHOOK_ALLOW_PRIVATE=1) → --clean → ALL journeys US1–US10 → --clean · 30 Sep
# NOTE: acc-v2-serve.sh takes the gate lock itself for next build — never wrap it in with-gate-lock (self-deadlock, 28 Sep)
set -uo pipefail
cd /root/projects/shark-crm
R=.qc-shots/crm/c44-accept; mkdir -p "$R"
S=.qc-shots/crm/BUILD-STATE; L="$R/run.log"; : > "$L"; : > "$R/_summary.txt"
cp -r .qc-shots/qc1-expected/scripts/. scripts/ >>"$L" 2>&1; echo "expected-restore exit=$?" >> "$R/_summary.txt"
echo "BUILDING $(date -u +%H:%M) $(git rev-parse --short HEAD)" > "$S"
export SHARK_AI_MOCK=1 WEBHOOK_ALLOW_PRIVATE=1
NODE_OPTIONS=--max-old-space-size=5120 bash scripts/acc-v2-serve.sh stop >>"$L" 2>&1
NODE_OPTIONS=--max-old-space-size=5120 bash scripts/acc-v2-serve.sh >>"$L" 2>&1; rc=$?
echo "build+serve exit=$rc" >> "$R/_summary.txt"
if [ $rc -ne 0 ]; then echo "FAILED $(date -u +%H:%M) rc=$rc" > "$S"; echo ALLDONE >> "$R/_summary.txt"; exit 1; fi
echo "READY $(date -u +%H:%M) $(git rev-parse --short HEAD) port=3215 ai=mock webhook-private=on" > "$S"
J() { NODE_OPTIONS=--max-old-space-size=3584 bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts "$@"; }
J --clean > "$R/clean-before.log" 2>&1; echo "clean-before exit=$? $(grep -a 'total rows' "$R/clean-before.log" | tail -1)" >> "$R/_summary.txt"
J --journey all > "$R/journeys.log" 2>&1; echo "journeys exit=$? $(grep -a JSON_SUMMARY "$R/journeys.log" | tail -1)" >> "$R/_summary.txt"
J --clean > "$R/clean-after.log" 2>&1; echo "clean-after exit=$? $(grep -a 'total rows' "$R/clean-after.log" | tail -1)" >> "$R/_summary.txt"
echo ALLDONE >> "$R/_summary.txt"
