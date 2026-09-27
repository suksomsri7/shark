#!/usr/bin/env bash
# C3.3 (commissions · c12a) + C2.7-fix (money reconcile · c20) controller verification (Fable · 27 ก.ย.) — main = C3.7 accepted + both merged · QC1 fresh seed
# launch: systemd-run --unit=crm-c33-verify-b --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash /root/projects/shark-crm/scripts/pending/run-c33-verify-b.sh
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c33-verify-b.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
# part B (27 ก.ย. 00:58): part A died = cgroup OOM during next build (MemoryMax=6G) after all suites/typecheck/fitness green → rerun from BUILD with 7.5G + swap
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
r "shots 3.3 (owner)"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.3
r "shots 3.3 (manager)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.3 --user manager
r "shots 3.3 (thana)"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.3 --user thana
r "shots 3.7 (owner · new pages at 390)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.7
r "qc-member-m3.10 (server up)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m3.10.mts
r "serve stop"    bash scripts/acc-v2-serve.sh stop
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
