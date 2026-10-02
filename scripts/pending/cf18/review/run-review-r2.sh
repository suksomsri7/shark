#!/usr/bin/env bash
# C5.5-fix13 independent review ROUND 2 — regression (QC3; QC2 only for c5.3) · one heavy job at a time (iso.sh + gate lock)
#   usage: cp scripts/pending/cf18/review/run-review-r2.sh /tmp/cf18r-run-<label>.sh && bash /tmp/cf18r-run-<label>.sh <label>
set -uo pipefail
cd /root/projects/shark-crm-c54d
LBL="${1:-rr2}"
D=/tmp/cf18r-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
echo "tree $(git rev-parse --short HEAD) · src diff vs HEAD: $(git status --short -- src | tr '\n' ' ') · start $(date -u +%FT%TZ)" >> "$SUM"
r() { local name="$1"; shift; local log="$D/$LBL-${name//[\/ ,]/_}.log"; local t0; t0=$(date +%s); "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(( $(date +%s) - t0 ))s $(grep -E 'JSON_SUMMARY|controls [0-9]|ผ่าน [0-9]|error TS|IDENTICAL|DIFFER|passed|failed' "$log" | tail -1 | cut -c1-700)" >> "$SUM"; }
q() { local n="$1"; shift; r "QC3 $n" bash scripts/iso.sh env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q2() { local n="$1"; shift; r "QC2 $n" bash scripts/iso.sh env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
q probe-cf18-review scripts/pending/cf18/review/probe-cf18-review.mts
q probe-cf18-r2 scripts/pending/cf18/probe-cf18-r2.mts
q probe-cf18 scripts/pending/cf18/probe-cf18.mts
q probe-cf18-outbox scripts/pending/cf18/probe-cf18-outbox.mts
q probe-cf15 scripts/pending/cf15/probe-cf15.mts "$LBL" base
q probe-cf12 scripts/pending/cf12/probe-cf12.mts
q c3.9 scripts/qc-crm-c3.9.mts
q2 "c5.3 L1,L3" scripts/qc-crm-c5.3.mts --only=L1,L3
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r fitness-noenv bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL bash scripts/with-gate-lock.sh pnpm fitness
r fitness-qc3 bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm fitness
echo "tracked diff after the run: $(git status --short | grep -v '^??' | tr '\n' ' ') · end $(date -u +%FT%TZ)" >> "$SUM"
echo ALLDONE >> "$SUM"
