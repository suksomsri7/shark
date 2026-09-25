#!/usr/bin/env bash
# C2.6 headless re-run after oracle fix (Fable) — serve (no rebuild unless product changed) · web exam · stop · m1.9
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c26-web2.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
MODE="${1:-start}"
if [ "$MODE" = build ]; then r "BUILD+serve" env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh; else r "serve start" bash scripts/acc-v2-serve.sh start; fi
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=4096 bash scripts/with-gate-lock.sh pnpm typecheck
r "qc-crm-c2.6-web (headless)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c2.6-web.mts
r "serve stop"    bash scripts/acc-v2-serve.sh stop
r "qc-member-m1.9" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.9.mts
echo ALLDONE | tee -a "$L"
