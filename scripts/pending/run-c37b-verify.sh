#!/usr/bin/env bash
# C3.7 follow-up verification (Fable · 26 ก.ย.) — main = C3.6+C3.7 merged + follow-up (mobile.ts S0.3 · nav emails perm · 3.7 spec per-user · ORACLE-EDIT S1.2) · QC1 (seeded by c367 unit today)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c37b-verify.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
for s in qc-crm-c1.3 qc-crm-c2.5 qc-crm-c1.7 qc-crm-c0.2; do q "$s"; done
r "qc-nav-functions" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-nav-functions.mts
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
r "shots 3.7 (thana)"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.7 --user thana
r "shots 3.7 (owner)"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.7
q qc-crm-c3.7
r "serve stop"    bash scripts/acc-v2-serve.sh stop
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
