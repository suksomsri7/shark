#!/usr/bin/env bash
# C5.5-fix12 round 2 — run one probe/suite (QC2 · gate lock · own systemd unit) · log → /tmp/cf16-r2-logs/<logname>.log
#   usage: bash scripts/pending/cf16/run-r2.sh <logname> <script-under-scripts/ without .mts>
set -uo pipefail
cd /root/projects/shark-crm-cd2
D=/tmp/cf16-r2-logs; mkdir -p "$D"
N="$1"; F="$2"
bash scripts/iso.sh env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 CF16_DUMP="$D/$N.dump.json" CF16_BASELINE="${BASELINE:-}" \
  bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$F.mts" > "$D/$N.log" 2>&1
echo "exit=$? $(date -u +%FT%TZ)" >> "$D/$N.log"
