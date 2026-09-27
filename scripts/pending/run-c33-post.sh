#!/usr/bin/env bash
# C3.3 follow-up (Fable · 27 ก.ย.) — after run-c33-verify.sh ALLDONE: 3.7 thana shots + qc-crm-c3.7 rerun (freshness S1.6 / S2.x need shoot-crm + both summaries)
# launch: systemd-run --unit=crm-c33-post --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash /root/projects/shark-crm/scripts/pending/run-c33-post.sh
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c33-post.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "serve start (existing .next)" env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh start
r "shots 3.7 (thana)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.7 --user thana
r "shots 3.7 (owner)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 3.7
q qc-crm-c3.7
r "serve stop" bash scripts/acc-v2-serve.sh stop
echo ALLDONE | tee -a "$L"
