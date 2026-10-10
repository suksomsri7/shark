#!/usr/bin/env bash
# C5.5-fix2 ROUND 2 targeted regression (QC3 · CRM_V2_SWITCH=all) — one heavy job at a time, each in its own systemd unit (iso.sh) under the gate lock
# Use: bash scripts/pending/cf2/run-regress.sh [label]   → logs /tmp/cf2-logs/<label>-*.log + summary /tmp/cf2-logs/<label>.summary
set -uo pipefail
cd /root/projects/shark-crm-cf2
LBL="${1:-reg1}"
D=/tmp/cf2-logs; mkdir -p "$D"
SUM="$D/$LBL.summary"; : > "$SUM"
r() { local name="$1"; shift; local log="$D/$LBL-${name//\//_}.log"; "$@" > "$log" 2>&1; local rc=$?; echo "$name exit=$rc $(grep -E 'JSON_SUMMARY|🟢|🔴|passed|PASS|FAIL' "$log" | tail -1 | cut -c1-220)" >> "$SUM"; }
q() { r "$1" bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
for s in qc-crm-c2.5 qc-crm-c3.5 qc-crm-c1.7 qc-crm-c1.11 qc-crm-c2.6 qc-crm-c3.9 qc-crm-c0.2 qc-forms-notify; do q "$s"; done
echo ALLDONE >> "$SUM"
