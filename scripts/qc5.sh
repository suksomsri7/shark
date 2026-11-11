#!/usr/bin/env bash
# qc5.sh — run a command against QC branch #5 (`wo-pos-qc5`, Neon branch copied from `wo-pos-qc4` on 10 Oct 2026 00:0xZ)
#   เลนถ่ายภาพ (visual-pos.mts + เซิร์ฟเวอร์ QC บนทรี d) ใช้ QC5 เท่านั้น — ข้อสอบ DB ของ builder/ด่านยังอยู่ QC4
#   เหตุผล: ภาพกับข้อสอบเขียน tenant ซีดเดียวกัน (posqc-coffee) → รันทับกันได้แดงปลอมจาก residue (บทเรียน 9 ต.ค.)
#   ถ้า QC5 ล้าหลัง QC4 (seed ใหม่/migration ใหม่) ให้ลบแล้วแตกใหม่จาก QC4 (pnpm neon:delete wo-pos-qc5 → สร้างใหม่ parent=qc4) — ห้าม reseed
# Use: bash scripts/iso.sh bash scripts/qc5.sh pnpm exec tsx scripts/visual-pos.mts <wo> --states ... --base http://127.0.0.1:3228
#      bash scripts/qc5.sh env ACC_V2_PORT=3228 bash scripts/acc-v2-serve.sh start   (acc-v2-serve.sh อ่าน QC_ENV_FILE)
set -euo pipefail
cd "$(dirname "$0")/.."
F=.env.qc5
[ -f "$F" ] || { echo "🔴 qc5: no $F" >&2; exit 2; }
D="$(grep -m1 '^DIRECT_URL=' "$F" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
P="$(grep -m1 '^DATABASE_URL=' "$F" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
for U in "$D" "$P"; do
  case "$U" in *ep-royal-night*|*ep-plain-art*|*ep-cool-shadow*|*ep-weathered-river*|*ep-frosty-lab*|"") echo "🔴 qc5: URL is production, QC1–QC4 or empty — stop" >&2; exit 4 ;; esac
  case "$U" in *ep-fragrant-thunder*) : ;; *) echo "🔴 qc5: URL is not QC5 (ep-fragrant-thunder)" >&2; exit 4 ;; esac
done
# POS_QC_ALLOW_HOST: ด่านใน scripts/pos-qc-env.mts (loadPosQcEnv) รับเฉพาะ QC4 เว้นแต่ตั้งใจ — QC5 คือตั้งใจ (prod/QC1–3 ยังถูกปฏิเสธก่อน)
exec env DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE="$F" GATE_LOCK_FILE=/tmp/shark-gate-qc5.lock QC_BRANCH=qc5 POS_QC_ALLOW_HOST=ep-fragrant-thunder "$@"
