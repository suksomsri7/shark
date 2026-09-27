#!/usr/bin/env bash
# C3.4+C3.9 part B: build + shots 3.4 + 3.9 + m3.10 — launch ONLY after pausing other lanes (OOM lesson)
# launch: systemd-run --unit=crm-c34-verify-b --collect -p MemoryMax=7500M -p MemorySwapMax=3G --setenv=PATH="$PATH" --setenv=HOME=/root bash /root/projects/shark-crm/scripts/pending/run-c34-verify-b.sh
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c34-verify-b.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
r "shots 3.4 (owner)"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.4
r "shots 3.4 (thana)"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.4 --user thana
r "shots 3.9 (owner)"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.9
r "shots 3.9 (thana)"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.9 --user thana
r "qc-member-m3.10 (server up)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m3.10.mts
r "serve stop"    bash scripts/acc-v2-serve.sh stop
echo ALLDONE | tee -a "$L"
