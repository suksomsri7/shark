#!/usr/bin/env bash
# C4.4-fix: run the probes + the regression suites on QC3, one at a time (each under the QC3 gate lock) · logs in .qc-shots/crm/c44f/suites
# Use: systemd-run --unit=c44f-suites --collect -p WorkingDirectory=$PWD --setenv=PATH=$PATH bash scripts/pending/c44f/run-suites.sh [names…]
set -uo pipefail
cd "$(dirname "$0")/../../.."
OUT="${OUT:-.qc-shots/crm/c44f/suites}"
mkdir -p "$OUT"
LIST=("$@")
[ ${#LIST[@]} -eq 0 ] && LIST=(probe-1-convert probe-2-pipeline-quote-stages probe-3-company-doc-party probe-4-automation-company-deal probe-5-webhook-url c1.3 c1.4 c1.5 c1.8 c1.10 c2.1 c2.7 c2.9 c3.2 c3.5 c3.8)
for n in "${LIST[@]}"; do
  case "$n" in probe-r1) f="scripts/pending/c44f-review/probe-r1.mts" ;; probe-*) f="scripts/pending/c44f/$n.mts" ;; qc-*) f="scripts/$n.mts" ;; m*) f="scripts/qc-member-$n.mts" ;; *) f="scripts/qc-crm-$n.mts" ;; esac
  log="$OUT/$n.log"
  t0=$(date +%s)
  NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$f" > "$log" 2>&1
  code=$?
  sum=$(grep -a "JSON_SUMMARY" "$log" | tail -1 | cut -c1-200)
  last=$(grep -a -E "🟢|🔴" "$log" | tail -1 | cut -c1-160)
  echo "$(date -u +%H:%M:%S) $n exit=$code $(( $(date +%s) - t0 ))s ${sum:-$last}" >> "$OUT/_summary.txt"
done
echo "DONE" >> "$OUT/_summary.txt"
