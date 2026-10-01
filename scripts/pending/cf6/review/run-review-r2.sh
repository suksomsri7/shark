#!/usr/bin/env bash
# C5.5-fix5 independent review, round 2 — heavy jobs one at a time (iso.sh + gate lock) · QC3 only
# Use: bash scripts/pending/cf6/review/run-review-r2.sh [label] → /tmp/rv-cf6-logs/<label>-*.log + <label>.summary
set -uo pipefail
cd /root/projects/shark-crm-cf2
LBL="${1:-rv2}"
D=/tmp/rv-cf6-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
r() { local name="$1"; shift; local log="$D/$LBL-${name//\//_}.log"; local t0; t0=$(date +%s); "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(( $(date +%s) - t0 ))s $(grep -E 'JSON_SUMMARY|🟢|🔴|ผ่าน [0-9]|found [0-9]+ error|error TS' "$log" | tail -1 | cut -c1-260)" >> "$SUM"; }
q() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts" "${@:2}"; }
p() { local n="$1"; shift; r "$n" bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
echo "tree $(git rev-parse --short HEAD) · src status: $(git status --short -- src | wc -l) files · $(date -u +%FT%TZ)" >> "$SUM"
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
p rv-cf6-r2-fuzz scripts/pending/cf6/review/rv-cf6-r2-fuzz.mts 40000
q pending/cf6/review/rv-cf6-r2-db
p rv-cf6-fuzz scripts/pending/cf6/review/rv-cf6-fuzz.mts 60000
q pending/cf6/review/rv-cf6-db
q pending/cf6/probe-cf6-r2
q pending/cf6/probe-cf6-db "$LBL" base
for s in qc-crm-c2.5 qc-crm-c2.11 qc-kanban-k3.9 qc-kanban-k1.6; do q "$s"; done
r docs-crm bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/gen-crm-api-docs.mts --check
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
echo "src status after: $(git status --short -- src | wc -l) files · ALLDONE $(date -u +%FT%TZ)" >> "$SUM"
