#!/usr/bin/env bash
# C5.5-fix9 REVIEW runner — QC3 · one heavy job at a time (iso.sh + gate lock) · run a /tmp copy of this file
#   usage: bash /tmp/cf12-run-review.sh <label>      (summary → /tmp/cf12-review-logs/<label>.summary)
set -uo pipefail
cd /root/projects/shark-crm-c54d
LBL="${1:-r1}"
D=/tmp/cf12-review-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
echo "tree $(git rev-parse --short HEAD) · src diff: $(git status --short -- src | tr '\n' ' ') · start $(date -u +%FT%TZ)" >> "$SUM"
r() { local name="$1"; shift; local log="$D/$LBL-${name//\//_}.log"; local t0; t0=$(date +%s); "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(( $(date +%s) - t0 ))s $(grep -E 'JSON_SUMMARY|🟢|🔴|ผ่าน [0-9]|found [0-9]+ error|error TS' "$log" | tail -1 | cut -c1-400)" >> "$SUM"; }
q() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts" "${@:2}"; }
p() { local n="$1"; shift; r "$n" bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
p probe-review scripts/pending/cf12/review/probe-cf12-review.mts
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r fitness bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
for s in qc-crm-c3.9 qc-crm-c3.5; do q "$s"; done
echo "tracked diff at end: $(git status --short | grep -v '^??' | tr '\n' ' ') · end $(date -u +%FT%TZ)" >> "$SUM"
echo ALLDONE >> "$SUM"
