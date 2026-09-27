#!/usr/bin/env bash
# C3.3-fix + C1.3 fix on MAIN (a9523b59) — short suites pass before the part-B build (Fable · 27 ก.ย.)
# launch: systemd-run --unit=crm-c33fix-main --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash /root/projects/shark-crm/scripts/pending/run-c33fix-main.sh
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c33fix-main.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
for s in qc-crm-c3.3 qc-crm-c3.3 qc-payroll qc-payroll-reverse qc-hr-payadjust qc-crm-c2.7 qc-crm-c1.3 qc-crm-c3.4 qc-crm-c2.4 qc-crm-c1.6 qc-crm-c3.2 qc-crm-c1.5; do q "$s"; done
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL -u DIRECT_URL pnpm fitness
echo ALLDONE | tee -a "$L"
