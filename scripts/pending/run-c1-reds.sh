#!/usr/bin/env bash
# ปิดเฟส C1 — รันชุดที่แดงใน qc:all ทีละชุดหลัง reseed + เปิดเซิร์ฟเวอร์ QC · QC1
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c1-reds2.log
: > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "🔴 not QC1" | tee -a "$L"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "seed crm #1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed crm #2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed acc-v2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-acc-v2-qc.mts
r "exp contacts"  bash scripts/with-gate-lock.sh pnpm exec tsx scripts/acc-v2-expected-contacts.mts
r "exp profile"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/acc-v2-expected-contact-profile.mts
r "exp dashboard" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/acc-v2-expected-dashboard.mts
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
r "serve start"   bash scripts/acc-v2-serve.sh start
while read -r s; do r "qc-$s" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/qc-$s.mts"; done < scripts/pending/c1-reds.txt
r "serve stop"    bash scripts/acc-v2-serve.sh stop
echo ALLDONE | tee -a "$L"
