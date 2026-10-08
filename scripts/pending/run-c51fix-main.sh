#!/usr/bin/env bash
# controller: C5.1-fix on MAIN — deploy crm_perf_indexes to QC2/QC1/QC3 + confirmation suites on QC1 · 28 Sep
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c51fix-main.log; : > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
for e in .env.qc2 .env.qc .env.qc3; do r "migrate deploy $e" env QC_ENV_FILE=$e bash scripts/with-gate-lock.sh bash scripts/qc-prisma.sh migrate deploy; r "migrate status $e" env QC_ENV_FILE=$e bash scripts/qc-prisma.sh migrate status; done
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
for s in qc-crm-c1.3 qc-crm-c1.4 qc-crm-c1.5 qc-crm-c1.6 qc-crm-c1.7 qc-crm-c1.9 qc-crm-c2.2 qc-crm-c2.5 qc-crm-c2.6 qc-crm-c2.7 qc-crm-c2.11 qc-crm-c3.1 qc-crm-c3.2 qc-crm-c3.3 qc-crm-c3.6 qc-crm-c3.9 qc-crm-c3.0 qc-member-m1.2 qc-crm-c51fix-equiv; do r "$s" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$s.mts"; done
r "typecheck" env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness" pnpm fitness
r "fitness-noenv" env -u DATABASE_URL -u DIRECT_URL pnpm fitness
echo ALLDONE | tee -a "$L"
