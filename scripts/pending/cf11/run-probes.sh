#!/usr/bin/env bash
# C5.5-fix8 — run the cf11 probes (QC3 · iso.sh + gate lock · one at a time) · run a /tmp copy of this file
#   usage: bash /tmp/cf11-run-probes.sh <label>     (summary → /tmp/cf11-logs/<label>.summary)
set -uo pipefail
cd /root/projects/shark-crm-c54e
LBL="${1:-p}"
D=/tmp/cf11-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
echo "tree $(git rev-parse --short HEAD) + diff: $(git status --short -- src scripts/fitness.mts scripts/lib | tr '\n' ' ')" >> "$SUM"
r() { local name="$1"; shift; local log="$D/$LBL-${name//\//_}.log"; local t0; t0=$(date +%s); "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(( $(date +%s) - t0 ))s $(grep -E 'JSON_SUMMARY|🟢|🔴|ผ่าน [0-9]|found [0-9]+ error|error TS' "$log" | tail -1 | cut -c1-300)" >> "$SUM"; }
q() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts" "${@:2}"; }
q pending/cf11/probe-cf11-keys
q pending/cf11/probe-cf11-contains
q pending/cf11/probe-cf11-mail
echo ALLDONE >> "$SUM"
