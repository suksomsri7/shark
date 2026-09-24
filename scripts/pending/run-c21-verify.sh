#!/usr/bin/env bash
# C2.1 controller verification — main tree = C2.0 accepted + C2.1 patch applied · QC1
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c21-verify3.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "migrate diff (must be empty)" bash scripts/qc-prisma.sh migrate diff --from-config-datasource --to-schema prisma/schema --script
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
# 🔴 qc-member-m1.1 ต้องอยู่ตรงนี้: ข้อ M1.1-S3.4 พิสูจน์ว่า seed idempotent ด้วยการ **รัน seed-member-qc ซ้ำ**
#    ⇒ ลบร้าน QC แล้วสร้างใหม่ (tenantId ใหม่) ⇒ ข้อมูล CRM ที่ผูกกับร้านนั้นหายทั้งชุด (CRM ใช้ร้าน/slug เดียวกัน)
#    วางไว้ก่อน seed CRM: S3.1 ต้องเห็นระบบ 8 ตัวพอดี (ยังไม่มี CRM/ACCOUNT/INVENTORY) และ S3.4 รีเซ็ตก่อน CRM ลงข้อมูล
r "qc-member-m1.1" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.1.mts
r "seed crm #1"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed crm #2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
q qc-crm-c2.1
r "probe-c21-builder" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c21-builder.mts
for s in qc-automation qc-kanban-k2.9 qc-member-fix-s2 qc-member-fix-s3 qc-crm-c1.8 qc-crm-c1.11 qc-crm-c2.0 qc-crm-v1 qc-crm-c0.2; do q "$s"; done
r "qc-nav-functions" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-nav-functions.mts
r "probe-uiversion-gate (no env)" env -u CRM_V2_SWITCH bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-uiversion-gate.mts
r "typecheck"     env NODE_OPTIONS=--max-old-space-size=4096 bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL -u DIRECT_URL pnpm fitness
r "BUILD+serve"   env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh
r "shots 2.1"     bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 2.1
r "serve stop"    bash scripts/acc-v2-serve.sh stop
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
