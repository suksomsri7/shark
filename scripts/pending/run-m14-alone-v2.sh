#!/usr/bin/env bash
# controller: re-run qc-member-m1.4 alone on QC1 (S6.3 stuck=1 check) · 27 Sep
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/m14-alone-v2.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
for i in 1 2; do echo "== m1.4 #$i ==" >>"$L"; bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.4.mts >>"$L" 2>&1; echo "exit=$?" >>"$L"; done
echo "== probe ==" >>"$L"; pnpm exec tsx scripts/pending/q-outbox-stuck4.mts >>"$L" 2>&1
echo ALLDONE >>"$L"
