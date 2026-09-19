#!/usr/bin/env bash
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/m31-alone.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "seed crm #1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed crm #2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
r "count members" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-which-qc.mts
r "qc-member-m3.1" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m3.1.mts
r "serve start"   bash scripts/acc-v2-serve.sh start
r "qc-member-m3.10" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m3.10.mts
r "serve stop"    bash scripts/acc-v2-serve.sh stop
echo ALLDONE | tee -a "$L"
