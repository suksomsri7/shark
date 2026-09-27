#!/usr/bin/env bash
# controller: re-run the oracle-sweep suites on MAIN / QC1 after merging the sweep (C4.1 registry policy) · 27 Sep
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/sweep-verify.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
for s in qc-crm-c2.5 qc-crm-c2.4 qc-crm-c2.2 qc-crm-c3.4 qc-crm-c1.11 qc-crm-c3.2 qc-crm-c2.6 qc-crm-c2.7 qc-crm-c3.1 qc-crm-c3.5; do r "$s" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$s.mts"; done
r "typecheck" env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness" pnpm fitness
r "fitness-noenv" env -u DATABASE_URL -u DIRECT_URL pnpm fitness
echo ALLDONE | tee -a "$L"
