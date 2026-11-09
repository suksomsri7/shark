#!/usr/bin/env python3
"""S3b.2 — จัดภาพสโตร์ 2.0 จาก RAW (shoot.sh) → ledger/store-2.0/shots/<locale>/<size>/NN-*.png + contact sheet ต่อภาษา

ตรวจทุกใบ: ขนาดตรงสเปก Apple · summary ok (ไม่มี error/overflow/unmocked) · ภาพอังกฤษต้องไม่มีอักษรไทยในข้อความบนจอ
            · ไม่มีคำ "QC"/"qc.invalid" บนจอ
ใช้: python3 ledger/store-2.0/finalize.py   [--sheets-only]
"""
import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
RAW = Path("/root/qc-shots/store-2.0/raw")
OUT = ROOT / "ledger/store-2.0/shots"
ORDER = [  # ลำดับในสโตร์ (ใบแรกสำคัญสุด)
    ("01-approve-in-chat", "secretary-room-r1"),
    ("02-tasks", "secretary"),
    ("03-approvals", "secretary-inbox"),
    ("04-scheduled", "secretary-scheduled"),
    ("05-customer-chat-translate", "customers-x9"),
    ("06-team", "secretary-staff"),
    ("07-settings", "secretary-settings"),
]
SIZES = {"iphone69": (1290, 2796), "iphone65": (1242, 2688), "ipad13": (2048, 2732)}
THAI = re.compile("[฀-฾เ-๿]")


def main():
    bad = []
    for loc in ("th", "en"):
        for tag, size in SIZES.items():
            src = RAW / loc / tag
            summ = {s["name"]: s for s in json.loads((src / "summary.json").read_text())["screens"]}
            dst = OUT / loc / tag
            if dst.exists():
                shutil.rmtree(dst)
            dst.mkdir(parents=True)
            for out_name, raw_name in ORDER:
                s = summ.get(raw_name)
                f = src / f"{raw_name}.png"
                if not s or not f.exists():
                    bad.append(f"{loc}/{tag}/{raw_name}: ไม่มีภาพ")
                    continue
                if not s["ok"] or s["unmocked"]:
                    bad.append(f"{loc}/{tag}/{raw_name}: ok={s['ok']} errors={s['errors']} missing={s['missing']} overflow={s['overflow']} unmocked={s['unmocked']}")
                im = Image.open(f)
                if im.size != size:
                    bad.append(f"{loc}/{tag}/{raw_name}: ขนาด {im.size} ≠ {size}")
                texts = s.get("texts", "")
                # เมนูลิ้นชักของเปลือก 1.0 (กิจการ/ระบบงาน/…/ออกจากระบบ) อยู่ใน DOM แต่ปิดอยู่ ไม่เห็นบนภาพ — และยังเป็นไทยล้วนทุกภาษา
                # (ดู README ข้อค้าง) ⇒ ตัดออกก่อนตรวจ · ตรวจภาพด้วยตาแล้วว่าลิ้นชักไม่โผล่
                cut = texts.find("ออกจากระบบ")
                if cut >= 0:
                    texts = texts[cut + len("ออกจากระบบ"):]
                if loc == "en" and THAI.search(texts):
                    bad.append(f"{loc}/{tag}/{raw_name}: มีอักษรไทยบนจอ: {sorted(set(m.group(0) for m in re.finditer(r'[฀-฾เ-๿][^\\n]{0,30}', texts)))[:5]}")
                if re.search(r"\bQC\b|qc\.invalid", texts):
                    bad.append(f"{loc}/{tag}/{raw_name}: มีคำ QC บนจอ")
                # Apple ไม่รับ alpha — บันทึกเป็น RGB
                im.convert("RGB").save(dst / f"{out_name}.png", optimize=True)
        sheet(loc)
    if bad:
        print("❌ มีปัญหา:")
        for b in bad:
            print("  ", b)
        sys.exit(1)
    print("✅ ทุกใบผ่าน")


def sheet(loc):
    """contact sheet: แถวละขนาด (iPhone 6.9 · iPhone 6.5 · iPad 13) · ใบละ 7 ภาพ"""
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22) if Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf").exists() else ImageFont.load_default()
    H = 620
    small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15) if Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf").exists() else ImageFont.load_default()
    rows = []
    for tag, (w, h) in SIZES.items():
        tw = int(w * H / h)
        row = Image.new("RGB", (len(ORDER) * (tw + 16) + 16, H + 56), "white")
        d = ImageDraw.Draw(row)
        for i, (name, _) in enumerate(ORDER):
            p = OUT / loc / tag / f"{name}.png"
            if p.exists():
                row.paste(Image.open(p).convert("RGB").resize((tw, H), Image.LANCZOS), (16 + i * (tw + 16), 44))
            d.text((16 + i * (tw + 16), 12), name if i else f"{tag}: {name}", fill="black", font=small)
        rows.append(row)
    W = max(r.width for r in rows)
    out = Image.new("RGB", (W, sum(r.height for r in rows) + 60), (235, 235, 235))
    ImageDraw.Draw(out).text((16, 16), f"SHARK HUB 2.0 — App Store screenshots · {loc}", fill="black", font=font)
    y = 60
    for r in rows:
        out.paste(r, (0, y))
        y += r.height
    out.save(OUT / f"contact-sheet-{loc}.png", optimize=True)


if __name__ == "__main__":
    if "--sheets-only" in sys.argv:  # ทำ contact sheet ใหม่จากภาพใน shots/ (ไม่ตรวจ/ไม่คัดลอกซ้ำ)
        sheet("th")
        sheet("en")
    else:
        main()
