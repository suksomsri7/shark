#!/usr/bin/env bash
# cd2: run ONE suite/probe against QC3 in its own systemd unit, log to /tmp/cd2-logs/<run>/<name>.log
# use: bash scripts/pending/cd2/run-one.sh <run> <name> <script path without .mts>
set -uo pipefail
cd /root/projects/shark-crm-cd2
RUN="$1"; NAME="$2"; S="$3"; shift 3
D=/tmp/cd2-logs/$RUN; mkdir -p "$D"
bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "$S.mts" "$@" > "$D/$NAME.log" 2>&1
echo "exit=$?" >> "$D/$NAME.log"
