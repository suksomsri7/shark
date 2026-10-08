#!/usr/bin/env bash
# controller: J3 probe on QC3 from MAIN (probe refuses non-QC3 hosts) · 30 Sep
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-j3b.log; : > "$L"
echo "== probe-j3 (qc3) ==" >> "$L"
env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cj3/probe-j3.mts >> "$L" 2>&1; echo "exit=$?" >> "$L"
echo ALLDONE >> "$L"
