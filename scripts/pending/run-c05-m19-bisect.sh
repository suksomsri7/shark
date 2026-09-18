#!/usr/bin/env bash
# หาตัวการที่ทำ qc-member-m1.9 S4.2/S4.4 แดงในรอบรวม (บทเรียน §12B: รันทีละชุดคั่นด้วย m1.9)
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c05-m19-bisect.log
: > "$L"
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
q() { r "$1" bash scripts/with-gate-lock.sh pnpm exec tsx "scripts/$1.mts"; }
seed() { r "reseed member" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-member-qc.mts; r "seed crm" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-crm-qc.mts; }
echo "### A: m1.9 alone after reseed" | tee -a "$L"; seed; q qc-member-m1.9
echo "### B: m3.3 then m1.9" | tee -a "$L"; seed; q qc-member-m3.3; q qc-member-m1.9
echo "### C: fix-s3 then m1.9" | tee -a "$L"; seed; q qc-member-fix-s3; q qc-member-m1.9
echo "### D: crm-c0.5 then m1.9" | tee -a "$L"; seed; q qc-crm-c0.5; q qc-member-m1.9
echo ALLDONE | tee -a "$L"
