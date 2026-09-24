#!/usr/bin/env bash
# C2.4+C2.5 verify v3 (Fable) — after visual-crm SPECS fix: typecheck · fitness · build · shots 2.4/2.5 · m1.9 (oracles+regressions already green in v2)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c24c25-verify3.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=4096 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
r "shots 2.4"     bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 2.4
r "shots 2.5"     bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 2.5
r "serve stop"    bash scripts/acc-v2-serve.sh stop
r "qc-member-m1.9" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.9.mts
echo ALLDONE | tee -a "$L"
