#!/usr/bin/env bash
# C0.3 controller verification — reseed → drain → oracle → ALL account/approval/chat/hr/inv regressions → gates → build
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c03-verify.log
: > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts
r "seed crm"      bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts
r "seed acc-v2"   bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-acc-v2-qc.mts
# 🔴 ชุดบัญชีบางชุดอ่าน "เฉลยเสริม" ที่ต้องสร้างใหม่ทุกครั้งหลัง reseed (ไม่งั้นแดงด้วยข้อความ "เฉลยยังไม่มีคีย์ …")
for e in acc-v2-expected-contacts acc-v2-expected-dashboard acc-v2-expected-contact-profile; do
  r "expected $e" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$e.mts"
done
r "DRAIN"         bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-cron.mts
q qc-crm-c0.3
for s in $(ls scripts/qc-acc-v2-*.mts scripts/qc-account-*.mts scripts/qc-approval*.mts | xargs -n1 basename | sed 's/\.mts$//'); do q "$s"; done
for s in qc-pos-account qc-crm qc-crm-activity qc-chat-core-v2 qc-chat-member-autolink qc-chat-security-scope qc-payroll qc-hr-payadjust qc-hr qc-inventory qc-inventory-item qc-inventory-account qc-member-fix-s2; do q "$s"; done
r "typecheck"     bash scripts/with-gate-lock.sh pnpm typecheck
r "fitness"       pnpm fitness
r "fitness-noenv" env -u DATABASE_URL pnpm fitness
r "BUILD"         bash scripts/acc-v2-serve.sh
r "serve stop"    bash scripts/acc-v2-serve.sh stop
q qc-member-m1.9
echo ALLDONE | tee -a "$L"
