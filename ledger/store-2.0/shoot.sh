#!/usr/bin/env bash
# S3b.2 — ถ่ายภาพสโตร์ 2.0 ทุกภาษา × ทุกขนาด ด้วย apps/mobile/qc/shoot-sec.mjs (web export ของแอปจริง + API mock จาก fixture · ไม่แตะ prod/DB)
# ใช้ (จากรากรีโป · หนัก → iso.sh):
#   ISO_MEM=6G bash scripts/iso.sh bash ledger/store-2.0/shoot.sh            # export ใหม่ + ถ่ายทั้งหมด
#   ISO_MEM=6G bash scripts/iso.sh env SKIP_EXPORT=1 bash ledger/store-2.0/shoot.sh
# แล้ว: python3 ledger/store-2.0/finalize.py  (ตั้งชื่อ/ตรวจขนาด/ทำ contact sheet)
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 ledger/store-2.0/make-fixtures.py
RAW="${RAW:-/root/qc-shots/store-2.0/raw}"
COPY=/root/qc-shark-mobile-store20
PORT=4734
# fixture → route (ลำดับภาพกำหนดใน finalize.py)
JOBS=(
  "s2.4:/secretary/room/r1"
  "s2.20:/secretary,/secretary/staff"
  "s2.5:/secretary/inbox,/secretary/scheduled"
  "s3a6:/customers/x9"
  "s2.7:/secretary/settings"
)
# ชื่อ:กว้าง:สูง:สเกล  → 1290×2796 (6.9"/6.7") · 1242×2688 (6.5") · 2048×2732 (iPad 13"/12.9")
SIZES=("iphone69:430:932:3" "iphone65:414:896:3" "ipad13:1024:1366:2")
first=1
[ "${SKIP_EXPORT:-0}" = 1 ] && first=0
for loc in th en; do
  for sz in "${SIZES[@]}"; do
    IFS=: read -r tag w h s <<<"$sz"
    for job in "${JOBS[@]}"; do
      fx="${job%%:*}"; routes="${job#*:}"
      skip=1; [ $first = 1 ] && skip=0
      env QC_PREPARE=1 QC_SKIP_EXPORT=$([ $skip = 1 ] && echo 1 || echo 0) QC_COPY=$COPY QC_PORT=$PORT \
        QC_OUT="$RAW/$loc/$tag" QC_VIEW_TAG=$tag QC_VIEW_W=$w QC_VIEW_H=$h QC_VIEW_SCALE=$s \
        ROUTES="$routes" FIXTURE="ledger/store-2.0/fixtures/$loc/$fx.json" \
        node apps/mobile/qc/shoot-sec.mjs > "$RAW/.log-$loc-$tag-$fx.txt" 2>&1 || echo "❌ $loc $tag $fx (ดู $RAW/.log-$loc-$tag-$fx.txt)"
      first=0
      echo "· $loc $tag $fx"
    done
  done
done
echo "เสร็จ → $RAW"
