#!/usr/bin/env bash
# controller: MAIN gate for C4.4-fix3 (J3 r2 8f41f9ae, patched onto session/crm 03848b5b) · QC1 · 30 Sep
set -uo pipefail
M=/root/projects/shark-crm; cd "$M"
L=.qc-shots/crm/main-j3.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1" >> "$L"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" >> "$L"; shift; "$@" >> "$L" 2>&1; rc=$?; echo "exit=$rc" >> "$L"; }
q() { r "$1" env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r typecheck env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
q pending/cj3/probe-j3
for s in qc-crm-c2.6 qc-crm-c2.5 qc-crm-c1.8 qc-crm-c3.9 qc-crm-c1.11 qc-form qc-forms-notify qc-crm-c0.2; do q "$s"; done
r fitness pnpm fitness
r fitness-noenv env -u DATABASE_URL -u DIRECT_URL pnpm fitness
echo ALLDONE >> "$L"
