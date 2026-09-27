#!/usr/bin/env bash
# C4.2 pilot: real button run as OWNER against the server built from 15707b04 (Fable · 27 ก.ย.)
# launch: systemd-run --unit=crm-c42-pilot --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash /root/projects/shark-crm/scripts/pending/run-c42-pilot.sh
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c42-pilot.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all CRM_EXPECTED_PATH=/root/projects/shark-crm/scripts/crm-expected.json
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
r "serve start (existing .next)" env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh start
r "buttons (owner)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-buttons.mts --user owner
r "serve stop"    bash scripts/acc-v2-serve.sh stop
echo ALLDONE | tee -a "$L"
