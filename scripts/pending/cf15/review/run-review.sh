#!/usr/bin/env bash
# C5.5-fix11 REVIEW runner — QC3 · one heavy job at a time (iso.sh + gate lock) · run a /tmp copy of this file
#   needs a detached base worktree at $BASE (3e9930ec) with node_modules symlinked and the eq probe + builder probe copied in
#   usage: bash /tmp/cf15-run-review.sh <label>      (summary → /tmp/cf15-review-logs/<label>.summary)
set -uo pipefail
cd /root/projects/shark-crm-c54d
BASE=/root/projects/shark-crm-c54d-rv11base
LBL="${1:-rv1}"
D=/tmp/cf15-review-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
echo "tree $(git rev-parse --short HEAD) · base $(git -C $BASE rev-parse --short HEAD) · start $(date -u +%FT%TZ)" >> "$SUM"
r() { local name="$1"; shift; local log="$D/$LBL-${name//\//_}.log"; local t0; t0=$(date +%s); "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(( $(date +%s) - t0 ))s $(grep -E 'JSON_SUMMARY|COMPARE|DUMP|SCALE|found [0-9]+ error|error TS' "$log" | tail -2 | tr '\n' ' ' | cut -c1-500)" >> "$SUM"; }
p() { local n="$1"; shift; r "$n" bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$@"; }
pb() { local n="$1"; shift; r "$n" bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh bash -c "cd $BASE && pnpm exec tsx $*"; }
# adversarial equivalence: base twice (fixture determinism), tip twice, each compared with the first base dump
pb eq-base scripts/pending/cf15/review/probe-cf15-review-eq.mts base
pb eq-base2 scripts/pending/cf15/review/probe-cf15-review-eq.mts base2 base
p eq-tip scripts/pending/cf15/review/probe-cf15-review-eq.mts tip base
p eq-tip2 scripts/pending/cf15/review/probe-cf15-review-eq.mts tip2 base
# builder's equivalence fixture, regenerated independently on the base tree, then the tip compared to it
pb cf15-base scripts/pending/cf15/probe-cf15.mts rvbase
p cf15-tip scripts/pending/cf15/probe-cf15.mts rvtip rvbase
p review-tip scripts/pending/cf15/review/probe-cf15-review.mts
p cf15-scale scripts/pending/cf15/probe-cf15-scale.mts 50000
p cf12 scripts/pending/cf12/probe-cf12.mts
p cf12-r2 scripts/pending/cf12/probe-cf12-r2.mts
p cf12-review scripts/pending/cf12/review/probe-cf12-review.mts
p cf12-review-chain scripts/pending/cf12/review/probe-cf12-review-chain.mts
p cf12-review-scale scripts/pending/cf12/review/probe-cf12-review-scale.mts 500
p cf12-review-r2 scripts/pending/cf12/review/probe-cf12-review-r2.mts
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r fitness bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness.mts
echo "tracked diff at end: $(git status --short | grep -v '^??' | tr '\n' ' ') · end $(date -u +%FT%TZ)" >> "$SUM"
echo ALLDONE >> "$SUM"
