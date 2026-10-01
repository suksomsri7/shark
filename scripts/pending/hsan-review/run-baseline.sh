#!/usr/bin/env bash
# controller: the 5 suites red on the hotfix tip, re-run on QC3 with the tree at BASE 04d2ade9 (same DB, same scripts dir state) — identical reds ⇒ not caused by the hotfix. Restores the tip at the end.
set -uo pipefail
cd /root/projects/shark-crm-hsan
L=/root/projects/shark-crm-hsan/.qc-shots/baseline.log; : > "$L"
TIP=0b7e7285
git checkout -q --detach 04d2ade9 >> "$L" 2>&1 || { echo "checkout base failed" >> "$L"; exit 1; }
echo "tree at $(git rev-parse --short HEAD)" >> "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
for s in qc-kanban-k3.5 qc-member-m1.7 qc-member-m3.10 qc-member-m3.11 qc-crm-c2.5; do r "BASE QC3 $s" env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$s.mts"; done
git checkout -q --detach $TIP >> "$L" 2>&1; echo "tree back at $(git rev-parse --short HEAD)" >> "$L"
echo ALLDONE >> "$L"
