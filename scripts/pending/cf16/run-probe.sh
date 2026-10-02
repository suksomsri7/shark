#!/usr/bin/env bash
# C5.5-fix12 — run probe-cf16 once (QC2 · gate lock · own systemd unit)
#   usage: bash scripts/pending/cf16/run-probe.sh <logname> [baseline-dump.json]
#   log → /tmp/cf16-logs/<logname>.log · DTO dump → /tmp/cf16-logs/<logname>.dump.json
set -uo pipefail
cd /root/projects/shark-crm-cd2
D=/tmp/cf16-logs; mkdir -p "$D"
N="${1:-probe-cf16}"
B="${2:-}"
bash scripts/iso.sh env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 CF16_DUMP="$D/$N.dump.json" CF16_BASELINE="$B" \
  bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf16/probe-cf16.mts > "$D/$N.log" 2>&1
echo "exit=$? $(date -u +%FT%TZ)" >> "$D/$N.log"
