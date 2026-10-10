#!/usr/bin/env bash
# controller: MAIN re-run of early suites after round-3 swap · 28 Sep
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/main-a-c43-r6.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
for s in qc-crm-c0.2 qc-acc-v2-contact-modal qc-crm-c1.3 qc-crm-c1.4 qc-crm-c1.5 qc-crm-c1.9 qc-member-m1.4 qc-crm-c3.8; do r "$s" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$s.mts"; done
echo ALLDONE | tee -a "$L"
