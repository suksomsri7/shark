#!/usr/bin/env bash
# ภาพคู่ MOCKUP | RENDER ของจอเลขา AI (ใบ S0.2) — ตัดหน้าจอจากภาพแบบ ledger/design-secretary/sec-[dark-]<ชุด>.jpg แล้ววางคู่ภาพเรนเดอร์จริง
# ใช้: bash scripts/parity-sec.sh <ชุด a|b|c|d|g|h|k> <ลำดับหน้า 1..N> <shot.png> <out.png> [--dark]
#   ผล: out.png = ซ้าย MOCKUP (ย่อ/ขยายให้สูงเท่าภาพเรนเดอร์) | เส้นแบ่ง 1 px | ขวา RENDER · ความสูงเท่ากัน
#   exit 2 = อาร์กิวเมนต์ผิด/ไม่มีไฟล์ · exit 0 = เขียน out.png แล้ว
#
# ค่าคงที่ของกริด (วัดจาก gen_sec.py + gen_glass_airy.py CSS และตรวจด้วยการเปิด sec-c.jpg 2760×2920 · render.sh ถ่ายที่ scale 1):
#   .phones: top 250 · flex-wrap · justify-content:center · gap 60 (แนวนอน) · row-gap 150 · padding 0 100 → 4 เครื่องต่อแถว
#   .phone : 560×1180 · padding 12 ⇒ จอ (.screen) = 536×1156 ที่ (x+12, y+12)
#   pitch แนวนอน = 560+60 = 620 · pitch แนวตั้ง = 1180+150 = 1330
#   แถวที่มี n เครื่องจัดกลาง: x0 = (2760 − (n·560 + (n−1)·60)) / 2  → แถวเต็ม 4 เครื่อง x0 = 170 (หน้า 1 = 170,250)
#   จำนวนหน้าต่อชุด (SETS ใน gen_sec.py): a 8 · b 8 · c 5 · d 3 · g 5 · h 4 · k 5
set -uo pipefail

usage() { echo "ใช้: bash scripts/parity-sec.sh <a|b|c|d|g|h|k> <หน้า> <shot.png> <out.png> [--dark]" >&2; exit 2; }
[ $# -ge 4 ] || usage
SET="$1"; IDX="$2"; SHOT="$3"; OUT="$4"; DARK="${5:-}"
[ -z "$DARK" ] || [ "$DARK" = "--dark" ] || usage

SHEET_W=2760; TOP=250; PW=560; PH=1180; GAP=60; ROWGAP=150; PER_ROW=4; INSET=12
case "$SET" in
  a|b) N=8 ;; c|g|k) N=5 ;; d) N=3 ;; h) N=4 ;;
  *) echo "ชุดไม่รู้จัก: $SET" >&2; exit 2 ;;
esac
[[ "$IDX" =~ ^[0-9]+$ ]] && [ "$IDX" -ge 1 ] && [ "$IDX" -le "$N" ] || { echo "หน้า $IDX อยู่นอก 1..$N ของชุด $SET" >&2; exit 2; }
[ -f "$SHOT" ] || { echo "ไม่พบภาพเรนเดอร์ $SHOT" >&2; exit 2; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JPG="$ROOT/ledger/design-secretary/sec-${DARK:+dark-}${SET}.jpg"
[ -f "$JPG" ] || { echo "ไม่พบภาพแบบ $JPG" >&2; exit 2; }
command -v convert >/dev/null || { echo "ต้องมี ImageMagick (convert)" >&2; exit 2; }

# ตำแหน่งเครื่องที่ IDX
I=$((IDX - 1)); ROW=$((I / PER_ROW)); COL=$((I % PER_ROW))
IN_ROW=$(( N - ROW * PER_ROW )); [ "$IN_ROW" -gt "$PER_ROW" ] && IN_ROW=$PER_ROW
X0=$(( (SHEET_W - (IN_ROW * PW + (IN_ROW - 1) * GAP)) / 2 ))
X=$(( X0 + COL * (PW + GAP) + INSET ))
Y=$(( TOP + ROW * (PH + ROWGAP) + INSET ))
SW=$((PW - 2 * INSET)); SH=$((PH - 2 * INSET))

H=$(identify -format '%h' "$SHOT" 2>/dev/null) || { echo "อ่านภาพ $SHOT ไม่ได้" >&2; exit 2; }
mkdir -p "$(dirname "$OUT")"
convert \( "$JPG" -crop "${SW}x${SH}+${X}+${Y}" +repage -resize "x${H}" \) \
  \( -size "1x${H}" xc:gray50 \) \
  \( "$SHOT" \) +append "$OUT" || { echo "convert ล้ม" >&2; exit 1; }
echo "PARITY-PAIR $OUT · mockup sec-${DARK:+dark-}${SET}.jpg หน้า $IDX crop ${SW}x${SH}+${X}+${Y} → สูง $H"
