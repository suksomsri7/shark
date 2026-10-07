#!/usr/bin/env bash
# controller: gate for batch C5.4-E (patch 03848b5b..314a4175 on session/crm 1b524af3) · tree = c54e worktree (HEAD 1b524af3 + patch, byte-identical to what main gets) · QC3 (QC1 busy with the it4 button run) + c5.3 L6 on QC2 · 1 Oct
set -uo pipefail
cd /root/projects/shark-crm-c54e
L=.qc-shots/crm/main-e.log; : > "$L"
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
q() { r "$1" env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
for p in pending/c54e/probe-c54e pending/c54e/probe-c54e-r2; do q "$p"; done
for s in qc-crm-c1.3 qc-crm-c1.4 qc-crm-c1.5 qc-crm-c1.6 qc-crm-c1.9 qc-crm-c1.11 qc-crm-c2.1 qc-crm-c2.2 qc-crm-c2.5 qc-crm-c2.6 qc-crm-c2.10 qc-crm-c3.5 qc-crm-c3.6 qc-crm-c0.2 qc-crm-c51fix-equiv; do q "$s"; done
r "QC2 c5.3 L6" env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c5.3.mts --only=L6
r docs-check bash scripts/qc3.sh pnpm docs --check
r fitness bash scripts/qc3.sh pnpm fitness
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
echo ALLDONE >> "$L"
