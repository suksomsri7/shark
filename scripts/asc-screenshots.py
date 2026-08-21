#!/usr/bin/env python3
"""อัปรูปหน้าจอขึ้น App Store Connect

Apple ให้อัปเป็น 3 จังหวะ (ไม่ใช่ POST ไฟล์ตรง ๆ):
  1. จอง slot → ได้ "uploadOperations" กลับมา (แต่ละอันคือชิ้นของไฟล์ + header ที่ต้องใส่)
  2. PUT ชิ้นไฟล์ไปตาม url ที่ให้มา
  3. PATCH บอกว่า uploaded แล้ว + ส่ง md5 ของไฟล์ให้ Apple ตรวจว่าไม่เพี้ยนระหว่างทาง

ถ้าข้าม md5 หรือส่งผิดชิ้น Apple จะขึ้นสถานะ error เงียบ ๆ ในหน้าเว็บ ไม่แจ้งตอนอัป
→ สคริปต์นี้จึงอ่านสถานะกลับมาตรวจทุกใบหลังอัปเสร็จ

ใช้:
  python3 scripts/asc-screenshots.py            → อัปจาก /tmp/appstore-shots (ต้องขนาด 1320×2868)
  python3 scripts/asc-screenshots.py --clear    → ลบรูปเดิมทั้งหมดก่อนอัปใหม่
"""
import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import jwt

ROOT = Path(__file__).resolve().parent.parent
KEY_ID = "U9DGP7TVFK"
ISSUER = "40d5244e-97b6-47a8-9487-0ffa8db07dc4"
APP_ID = "6793749205"
KEY_PATH = ROOT / "apps/mobile/credentials/AuthKey_U9DGP7TVFK.p8"
SHOTS_DIR = Path("/tmp/appstore-shots")
DISPLAY_TYPE = "APP_IPHONE_67"   # 1290×2796 — ตัวใหญ่สุดที่ ASC API รับ (ไม่มี APP_IPHONE_69)
EXPECTED_SIZE = (1290, 2796)
BASE = "https://api.appstoreconnect.apple.com/v1/"

# 🔴 Apple รับ token อายุไม่เกิน 20 นาที — ตั้ง 1800 แล้วโดนปฏิเสธ 401 ทันที
# (ข้อความ error บอกแค่ "credentials missing or invalid" ไม่ได้บอกว่าอายุเกิน — หลงทางง่าย)
TOK = jwt.encode(
    {"iss": ISSUER, "exp": int(time.time()) + 1200, "aud": "appstoreconnect-v1"},
    KEY_PATH.read_text(), algorithm="ES256", headers={"kid": KEY_ID, "typ": "JWT"},
)


def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"},
    )
    try:
        raw = urllib.request.urlopen(req).read()
        return json.loads(raw) if raw else {"ok": True}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            detail = " | ".join(f"{x.get('title')}: {x.get('detail')}" for x in json.loads(raw).get("errors", []))
        except Exception:
            detail = raw[:300]
        return {"ERR": e.code, "detail": detail}


def upload_one(set_id: str, path: Path) -> str:
    blob = path.read_bytes()
    r = api("POST", "appScreenshots", {"data": {
        "type": "appScreenshots",
        "attributes": {"fileSize": len(blob), "fileName": path.name},
        "relationships": {"appScreenshotSet": {"data": {"type": "appScreenshotSets", "id": set_id}}},
    }})
    if "ERR" in r:
        return f"❌ จอง slot ไม่ได้ — {r['detail']}"
    sid = r["data"]["id"]
    for op in r["data"]["attributes"]["uploadOperations"]:
        chunk = blob[op["offset"]: op["offset"] + op["length"]]
        req = urllib.request.Request(op["url"], data=chunk, method=op["method"])
        for h in op["requestHeaders"]:
            req.add_header(h["name"], h["value"])
        try:
            urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:
            return f"❌ ส่งชิ้นไฟล์ล้ม — {e.code}"
    r = api("PATCH", f"appScreenshots/{sid}", {"data": {
        "type": "appScreenshots", "id": sid,
        "attributes": {"uploaded": True, "sourceFileChecksum": hashlib.md5(blob).hexdigest()},
    }})
    return f"❌ ปิดงานไม่สำเร็จ — {r['detail']}" if "ERR" in r else sid


def main():
    files = sorted(SHOTS_DIR.glob("*.png"))
    if not files:
        print(f"ไม่เจอรูปใน {SHOTS_DIR}")
        sys.exit(1)

    # ตรวจขนาดก่อนยิง — Apple ปฏิเสธถ้าผิดแม้พิกเซลเดียว และแจ้งช้ากว่ามาก
    from PIL import Image
    for f in files:
        size = Image.open(f).size
        if size != EXPECTED_SIZE:
            print(f"❌ {f.name} ขนาด {size} ต้องเป็น {EXPECTED_SIZE}")
            sys.exit(1)
    print(f"✅ รูป {len(files)} ใบ ขนาดถูกต้องทั้งหมด {EXPECTED_SIZE}\n")

    vid = api("GET", f"apps/{APP_ID}/appStoreVersions?limit=1")["data"][0]["id"]
    locs = api("GET", f"appStoreVersions/{vid}/appStoreVersionLocalizations")["data"]

    for loc in locs:
        locale = loc["attributes"]["locale"]
        sets = api("GET", f"appStoreVersionLocalizations/{loc['id']}/appScreenshotSets")["data"]
        target = next((s for s in sets if s["attributes"]["screenshotDisplayType"] == DISPLAY_TYPE), None)

        if target and "--clear" in sys.argv:
            api("DELETE", f"appScreenshotSets/{target['id']}")
            target = None

        if not target:
            r = api("POST", "appScreenshotSets", {"data": {
                "type": "appScreenshotSets",
                "attributes": {"screenshotDisplayType": DISPLAY_TYPE},
                "relationships": {"appStoreVersionLocalization": {
                    "data": {"type": "appStoreVersionLocalizations", "id": loc["id"]}}},
            }})
            if "ERR" in r:
                print(f"[{locale}] ❌ สร้างชุดรูปไม่ได้ — {r['detail']}")
                continue
            target = r["data"]

        set_id = target["id"]
        existing = api("GET", f"appScreenshotSets/{set_id}/appScreenshots").get("data", [])
        have = {s["attributes"]["fileName"] for s in existing}

        print(f"[{locale}] ชุด {DISPLAY_TYPE} — มีอยู่แล้ว {len(existing)} ใบ")
        for f in files:
            if f.name in have:
                print(f"   · {f.name} มีแล้ว ข้าม")
                continue
            res = upload_one(set_id, f)
            print(f"   {'✅' if not res.startswith('❌') else ''} {f.name} {res if res.startswith('❌') else ''}")

        # อ่านกลับมาตรวจว่า Apple รับจริง ไม่ใช่แค่ไม่ error ตอนอัป
        time.sleep(3)
        final = api("GET", f"appScreenshotSets/{set_id}/appScreenshots").get("data", [])
        bad = [s["attributes"]["fileName"] for s in final
               if (s["attributes"].get("assetDeliveryState") or {}).get("state") == "FAILED"]
        states = {(s["attributes"].get("assetDeliveryState") or {}).get("state") for s in final}
        print(f"[{locale}] รวม {len(final)} ใบ · สถานะ {states or '-'}" + (f" · ❌ พัง: {bad}" if bad else ""))


if __name__ == "__main__":
    main()
