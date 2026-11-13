#!/usr/bin/env bash
# ภาพคู่ MOCKUP | RENDER ของจอ TRIPS (ใบ T1.1 เป็นต้นไป) — ภาพแบบ ledger/design-trips/<NN>-*.png วางคู่ภาพเรนเดอร์จริง (แบบ parity-sec.sh)
# ใช้: bash scripts/parity-trips.sh <16|17> <shot.png> <out.png>
#   16 = 16-shop-products.png (สินค้า · ตัวแก้ราชา) · 17 = 17-shop-settings-trips.png (ค่าตั้ง trips)
#   ผล: out.png = ซ้าย MOCKUP (ย่อ/ขยายให้สูงเท่าภาพเรนเดอร์) | เส้นแบ่ง 1 px | ขวา RENDER · ความสูงเท่ากัน
#   exit 2 = อาร์กิวเมนต์ผิด/ไม่มีไฟล์ · exit 1 = convert ล้ม · exit 0 = เขียน out.png แล้ว
# ภาพแบบทั้งชุดเป็นหน้าเดียว (หัวเรื่อง + กรอบจอ) — ไม่ครอป: ผู้คุมเทียบทั้งหน้า (ฉาก settings-similan-warning เทียบกับการ์ด Liveaboard ในภาพ 17)
set -uo pipefail

usage() { echo "ใช้: bash scripts/parity-trips.sh <16|17> <shot.png> <out.png>" >&2; exit 2; }
[ $# -eq 3 ] || usage
NO="$1"; SHOT="$2"; OUT="$3"
case "$NO" in
  16) NAME="16-shop-products" ;;
  17) NAME="17-shop-settings-trips" ;;
  *) echo "ภาพไม่รู้จัก: $NO (ใช้ 16 หรือ 17)" >&2; exit 2 ;;
esac
[ -f "$SHOT" ] || { echo "ไม่พบภาพเรนเดอร์ $SHOT" >&2; exit 2; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PNG="$ROOT/ledger/design-trips/${NAME}.png"
[ -f "$PNG" ] || { echo "ไม่พบภาพแบบ $PNG" >&2; exit 2; }
command -v convert >/dev/null || { echo "ต้องมี ImageMagick (convert)" >&2; exit 2; }

H=$(identify -format '%h' "$SHOT" 2>/dev/null) || { echo "อ่านภาพ $SHOT ไม่ได้" >&2; exit 2; }
mkdir -p "$(dirname "$OUT")"
convert \( "$PNG" -resize "x${H}" \) \
  \( -size "1x${H}" xc:gray50 \) \
  \( "$SHOT" \) +append "$OUT" || { echo "convert ล้ม" >&2; exit 1; }
echo "PARITY-PAIR $OUT · mockup design-trips/${NAME}.png → สูง $H"
