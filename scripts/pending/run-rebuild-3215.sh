#!/usr/bin/env bash
# controller: rebuild QC1 server 3215 from session/crm HEAD (C + E landed) · AI mock · 1 Oct
set -uo pipefail
cd /root/projects/shark-crm
R=.qc-shots/crm/rebuild-e; mkdir -p "$R"; S=.qc-shots/crm/BUILD-STATE; L="$R/run.log"; : > "$L"
echo "BUILDING $(date -u +%H:%M) $(git rev-parse --short HEAD)" > "$S"
export SHARK_AI_MOCK=1 WEBHOOK_ALLOW_PRIVATE=1
NODE_OPTIONS=--max-old-space-size=5120 bash scripts/acc-v2-serve.sh stop >>"$L" 2>&1
NODE_OPTIONS=--max-old-space-size=5120 bash scripts/acc-v2-serve.sh >>"$L" 2>&1; rc=$?
if [ $rc -ne 0 ]; then echo "FAILED $(date -u +%H:%M) rc=$rc" > "$S"; exit 1; fi
echo "READY $(date -u +%H:%M) $(git rev-parse --short HEAD) port=3215 ai=mock webhook-private=on" > "$S"
