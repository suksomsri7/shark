#!/usr/bin/env bash
# C2.0 controller verification — TAIL ONLY (build+serve, m3.10, m1.9) after unit crm-c20-verify was killed by a machine restart
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c20-verify2.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
q qc-member-m3.10
r "serve stop"    bash scripts/acc-v2-serve.sh stop
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
