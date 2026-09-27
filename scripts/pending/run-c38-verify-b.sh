#!/usr/bin/env bash
# Part B for C3.8 + C4.1 (Fable · 27 ก.ย.): build → 3.7 shots owner/thana (freshness) → shoot-crm → qc-crm-c3.7 → crawler check of C4.1's new testids (D6) → m3.10 → stop
# launch ONLY with other lanes paused: systemd-run --unit=crm-c38-verify-b --collect -p MemoryMax=7500M -p MemorySwapMax=3G --setenv=PATH="$PATH" --setenv=HOME=/root bash /root/projects/shark-crm/scripts/pending/run-c38-verify-b.sh
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c38-verify-b.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
r "shoot-crm (app harness)" env QC_PREPARE=1 node apps/mobile/qc/shoot-crm.mjs
r "shots 3.7 (owner)"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.7
r "shots 3.7 (thana)"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.7 --user thana
q qc-crm-c3.7
r "inventory crawl (C4.1 D6 · companies/contacts · owner)" env CRM_EXPECTED_PATH=/root/projects/shark-crm/scripts/crm-expected.json bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts --inventory --user owner --page '^/(companies|contacts)'
r "qc-member-m3.10 (server up)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m3.10.mts
r "serve stop"    bash scripts/acc-v2-serve.sh stop
echo ALLDONE | tee -a "$L"
