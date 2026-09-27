#!/usr/bin/env bash
# controller: production build from main HEAD + start QC server (QC1 · 3215 · SHARK_AI_MOCK=1) · 27 Sep
set -uo pipefail
cd /root/projects/shark-crm
S=.qc-shots/crm/BUILD-STATE; L=.qc-shots/crm/build-head.log; : > "$L"
echo "BUILDING $(date -u +%H:%M) $(git rev-parse --short HEAD)" > "$S"
export SHARK_AI_MOCK=1 NODE_OPTIONS=--max-old-space-size=5120
bash scripts/acc-v2-serve.sh stop >>"$L" 2>&1
bash scripts/acc-v2-serve.sh >>"$L" 2>&1; rc=$?
echo "exit=$rc" >>"$L"
if [ $rc -eq 0 ]; then echo "READY $(date -u +%H:%M) $(git rev-parse --short HEAD) port=3215 ai=mock" > "$S"; else echo "FAILED $(date -u +%H:%M) rc=$rc" > "$S"; fi
echo ALLDONE >>"$L"
