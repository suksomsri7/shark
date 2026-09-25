#!/usr/bin/env bash
# ปิดเฟส C2 (Fable · 25 ก.ย.) — qc:all บน QC1 · DATABASE_URL/DIRECT_URL จาก .env.qc (grep|cut) + ด่าน host
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/c2-qcall.log
: > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P" in *ep-plain-art*) ;; *) echo "🔴 DATABASE_URL ไม่ใช่ QC1 — หยุด" | tee -a "$L"; exit 1;; esac
case "$D" in *ep-plain-art*) ;; *) echo "🔴 DIRECT_URL ไม่ใช่ QC1 — หยุด" | tee -a "$L"; exit 1;; esac
echo "host ok: QC1" | tee -a "$L"
env DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all pnpm qc:all >>"$L" 2>&1
echo "exit=$?" | tee -a "$L"
echo ALLDONE | tee -a "$L"
