#!/usr/bin/env bash
# C5.5-fix6 independent review runs — QC2 · one job at a time (gate lock) · each in its own systemd unit (iso.sh) ·
#   logs /tmp/cf7-review-logs/ (SUMMARY) · same wrappers as scripts/pending/cf7/run-cf7.sh
set -uo pipefail
cd /root/projects/shark-crm-cd2
D=/tmp/cf7-review-logs; mkdir -p "$D"; S="$D/SUMMARY"; : > "$S"
r() { local n="$1"; shift; local t0=$(date +%s); "$@" > "$D/$n.log" 2>&1; local rc=$?; echo "$n exit=$rc $(( $(date +%s) - t0 ))s · $(grep -aE '🟢|🔴|JSON_SUMMARY|error TS|Found [0-9]+ error|ผ่าน [0-9]+/[0-9]+' "$D/$n.log" | tail -2 | tr '\n' ' ' | cut -c1-300)" >> "$S"; }
q2() { local n="$1"; local f="$2"; shift 2; r "$n" bash scripts/iso.sh env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$f.mts" "$@"; }
echo "start $(date -u +%FT%TZ)" >> "$S"
q2 probe-cf7-review pending/cf7/review/probe-cf7-review
q2 probe-cf7 pending/cf7/probe-cf7
q2 qc-crm-c3.4 qc-crm-c3.4
q2 qc-crm-c1.4 qc-crm-c1.4
r typecheck bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r fitness bash scripts/iso.sh bash scripts/qc2.sh pnpm exec tsx scripts/fitness.mts
echo "ALLDONE $(date -u +%FT%TZ)" >> "$S"
