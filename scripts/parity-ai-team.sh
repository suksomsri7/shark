#!/usr/bin/env bash
# คู่ภาพ MOCKUP | RENDER ของจอทีมพนักงาน AI (T0.3) — ตัดหน้าหนึ่งจากแผ่น mockup (8 จอ หรือ 4 จอ) มาวางคู่กับภาพที่ถ่ายจากแอป
# ใช้:  bash scripts/parity-ai-team.sh <mockup.jpg> <pageIndex> <shot.png> <out.png> [--dark]
#   pageIndex เริ่มที่ 1 · แผ่น 8 จอ = 1–8 (แถวละ 4) · แผ่น 4 จอ = 1–4
#   --dark = แถบหัว + ช่องไฟสีมืด ตัวหนังสือสว่าง (ปริยาย: แถบสว่าง) · ขนาดภาพเท่ากันทั้งสองแบบ
# ตารางของแผ่น mockup (จาก ledger/design-ai-team/render_airy.sh: หน้าต่าง 2760×2920 หรือ 2760×1620
#   + CSS ของ gen_glass_airy.py: .phones top 250 · padding 0 100 · gap 60 · row-gap 150 · .phone 560×1180 · padding 12):
#   SHEET_W 2760 · X0 170 · Y0 250 · ระยะต่อจอ 620 × 1330 · ขอบเครื่อง 12 · จอ 536×1156
#   ⇒ หน้า i: คอลัมน์ (i-1) % 4 · แถว (i-1) div 4 · กรอบ "จอ" = (182 + 620·col, 262 + 1330·row) กว้าง 536 สูง 1156
#   แผ่นกว้างอื่น = ตารางเดียวกันคูณ width/2760 · สูง/สเกล ≥ 2580 ⇒ 2 แถว (หน้า 1–8) ไม่งั้น 1 แถว (1–4)
# ภาพที่ได้ (PNG): แถบหัวสูง 64 px มีคำว่า MOCKUP (เหนือฝั่งซ้าย) และ RENDER (เหนือฝั่งขวา)
#   ซ้าย = กรอบจอของ mockup ย่อ/ขยายเป็น Wm × H พอดี ที่ (0, 64) · H = ความสูงของภาพถ่าย · Wm = round(536 · H / 1156)
#   ขวา = ภาพถ่าย "ไม่ย่อ" ที่ (Wm + 24, 64)   ⇒ ขนาดรวม (Wm + 24 + กว้างภาพถ่าย) × (H + 64)
# exit 0 = เขียนแล้ว · 2 = อาร์กิวเมนต์ขาด / pageIndex ไม่ใช่จำนวนเต็มในช่วงของแผ่น · 1 = อ่านไฟล์เข้าไม่ได้ · exit ≠ 0 ไม่เขียนอะไรเลย
# ใช้ Python PIL · ไม่มีเครือข่าย · ไม่ทิ้งไฟล์ชั่วคราว
set -uo pipefail

usage() {
  echo "usage: bash scripts/parity-ai-team.sh <mockup.jpg> <pageIndex> <shot.png> <out.png> [--dark]" >&2
  exit 2
}

DARK=0
ARGS=()
for a in "$@"; do
  if [ "$a" = "--dark" ]; then DARK=1; else ARGS+=("$a"); fi
done
[ "${#ARGS[@]}" -eq 4 ] || usage
MOCKUP="${ARGS[0]}"
PAGE="${ARGS[1]}"
SHOT="${ARGS[2]}"
OUT="${ARGS[3]}"
case "$PAGE" in
  '' | *[!0-9]*) echo "parity-ai-team: pageIndex must be a whole number (got '$PAGE')" >&2; exit 2 ;;
esac

exec python3 - "$MOCKUP" "$PAGE" "$SHOT" "$OUT" "$DARK" <<'PY'
import os, sys
from PIL import Image, ImageDraw, ImageFont

SHEET_W, X0, Y0, PITCH_X, PITCH_Y, BEZEL, SCREEN_W, SCREEN_H = 2760, 170, 250, 620, 1330, 12, 536, 1156
TWO_ROWS_MIN_H = 2580
LABEL_H, GAP = 64, 24

mockup_path, page_s, shot_path, out_path, dark = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] == "1"
page = int(page_s)
try:
    sheet = Image.open(mockup_path); sheet.load(); sheet = sheet.convert("RGB")
    shot = Image.open(shot_path); shot.load(); shot = shot.convert("RGB")
except Exception as e:  # ไฟล์ไม่มี / ไม่ใช่ภาพ
    sys.stderr.write("parity-ai-team: cannot read input: %s\n" % str(e)[:160]); sys.exit(1)

scale = sheet.size[0] / float(SHEET_W)
rows = 2 if sheet.size[1] / scale >= TWO_ROWS_MIN_H else 1
pages = 4 * rows
if page < 1 or page > pages:
    sys.stderr.write("parity-ai-team: pageIndex %d is outside 1-%d of this sheet\n" % (page, pages)); sys.exit(2)

col, row = (page - 1) % 4, (page - 1) // 4
x = X0 + BEZEL + PITCH_X * col
y = Y0 + BEZEL + PITCH_Y * row
box = tuple(int(round(v * scale)) for v in (x, y, x + SCREEN_W, y + SCREEN_H))
shot_w, h = shot.size
wm = int(round(SCREEN_W * h / float(SCREEN_H)))
left = sheet.crop(box).resize((wm, h), Image.LANCZOS)

bg, ink = ((16, 16, 22), (236, 236, 244)) if dark else ((244, 244, 248), (24, 24, 32))
out = Image.new("RGB", (wm + GAP + shot_w, h + LABEL_H), bg)
out.paste(left, (0, LABEL_H))
out.paste(shot, (wm + GAP, LABEL_H))

def font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    try:
        return ImageFont.load_default(size)
    except TypeError:
        return ImageFont.load_default()

draw = ImageDraw.Draw(out)
f = font(30)
for text, x0, width in (("MOCKUP", 0, wm), ("RENDER", wm + GAP, shot_w)):
    l, t, r, b = draw.textbbox((0, 0), text, font=f)
    draw.text((x0 + (width - (r - l)) / 2 - l, (LABEL_H - (b - t)) / 2 - t), text, fill=ink, font=f)

try:
    out.save(out_path, "PNG")
except Exception as e:
    try:
        os.remove(out_path)
    except OSError:
        pass
    sys.stderr.write("parity-ai-team: cannot write output: %s\n" % str(e)[:160]); sys.exit(1)
print("parity-ai-team: page %d of %d -> %s (%dx%d)" % (page, pages, out_path, out.size[0], out.size[1]))
PY
