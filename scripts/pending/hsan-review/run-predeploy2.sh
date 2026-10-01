#!/usr/bin/env bash
# controller: the 4 suites red on QC3 (seed-dependent) re-run on QC2 (branch of the seeded QC DB), hotfix tip
set -uo pipefail
cd /root/projects/shark-crm-hsan
L=.qc-shots/predeploy2.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
for s in qc-member-m1.7 qc-member-m3.11 qc-member-m3.10 qc-kanban-k3.5; do r "QC2 $s" env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$s.mts"; done
echo ALLDONE >> "$L"
