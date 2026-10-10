#!/usr/bin/env bash
# controller: MAIN gate for "C4.2-fix + C4.4-fix2" r3 (rebased on 5fb440fd, patched onto session/crm) · QC1 · 30 Sep
set -uo pipefail
M=/root/projects/shark-crm; cd "$M"
L=.qc-shots/crm/main-ui.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1" >> "$L"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
q() { r "$1" env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
for p in pending/cui/probe-j1-linkify pending/cui/probe-bl1-values pending/cui/probe-j1-send pending/cui/probe-j2-ai-off pending/cui/probe-n6-parent-system pending/c54d/probe-c54d pending/c54d/probe-c54d-r2 pending/c54d/probe-c54d-r3; do q "$p"; done
for s in qc-crm-c1.3 qc-crm-c1.4 qc-crm-c1.5 qc-crm-c1.6 qc-crm-c1.7 qc-crm-c1.9 qc-crm-c1.11 qc-crm-c2.1 qc-crm-c2.2 qc-crm-c2.4 qc-crm-c2.5 qc-crm-c2.6 qc-crm-c2.10 qc-crm-c2.11 qc-crm-c3.7 qc-crm-c0.2 qc-member-m1.9; do q "$s"; done
r docs-check pnpm docs --check
r fitness pnpm fitness
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
echo ALLDONE >> "$L"
