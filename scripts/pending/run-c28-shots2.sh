#!/usr/bin/env bash
# C2.8 follow-up (Fable · 25 ก.ย.): re-shoot 2.8 (contact-360 score block — target fallback) + qc-member-m3.7 with the server up · QC1 · reuse .next
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c28-shots2.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
r "serve start (reuse .next)" bash scripts/acc-v2-serve.sh start
r "shots 2.8 (owner)"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 2.8
r "shots 2.8 (manager)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 2.8 --user manager
r "qc-member-m3.7 (server up)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m3.7.mts
r "serve stop" bash scripts/acc-v2-serve.sh stop
r "qc-member-m1.9" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.9.mts
echo ALLDONE | tee -a "$L"
