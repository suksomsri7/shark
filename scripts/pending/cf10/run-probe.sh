#!/usr/bin/env bash
# C5.5-fix7 — run probe-cf10 once (QC2 · gate lock · own systemd unit) · usage: bash scripts/pending/cf10/run-probe.sh <logname>
#   log → /tmp/cf10-logs/<logname>.log
set -uo pipefail
cd /root/projects/shark-crm-cd2
D=/tmp/cf10-logs; mkdir -p "$D"
N="${1:-probe-cf10}"
bash scripts/iso.sh env CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:9 NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf10/probe-cf10.mts > "$D/$N.log" 2>&1
echo "exit=$? $(date -u +%FT%TZ)" >> "$D/$N.log"
